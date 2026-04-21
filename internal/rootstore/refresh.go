// Package rootstore fetches root CA bundles from CCADB and populates the
// tlsentinel.root_stores / tlsentinel.root_store_anchors tables.
//
// CCADB publishes a per-program trust matrix (which programs include which
// anchor, with trust bits) as one public CSV, plus per-program PEM bundles.
// For TLS purposes we restrict to anchors with the "Websites" / "Server
// Authentication" trust bit in each program.
//
// v1 scope: four builtins (microsoft, apple, mozilla, chrome). Apple and
// Chrome don't publish their own CCADB PEM bundles, but their anchor sets
// overlap heavily with Mozilla+Microsoft — any anchor missing a PEM is
// logged and skipped.
package rootstore

import (
	"context"
	"crypto/x509"
	"encoding/csv"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/certificates"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

// CCADB public endpoints.
const (
	urlTrustMatrix    = "https://ccadb.my.salesforce-sites.com/ccadb/AllIncludedRootCertsCSV"
	urlMozillaPEMTXT  = "https://ccadb.my.salesforce-sites.com/mozilla/IncludedRootsPEMTxt?TrustBitsInclude=Websites"
	urlMicrosoftPEMs  = "https://ccadb.my.salesforce-sites.com/microsoft/IncludedRootsPEMCSVForMSFT?MicrosoftEKUs=Server%20Authentication"
	fetchTimeout      = 2 * time.Minute
)

// trustEntry captures per-program membership derived from the trust matrix CSV.
type trustEntry struct {
	fingerprint string // lowercase hex SHA-256
	inApple     bool
	inChrome    bool
	inMicrosoft bool
	inMozilla   bool
}

// Refresh downloads CCADB data and updates the root_stores / root_store_anchors
// tables. Safe to invoke repeatedly; operations are idempotent.
func Refresh(ctx context.Context, store *db.Store, log *slog.Logger) error {
	client := &http.Client{Timeout: fetchTimeout}

	matrix, err := fetchTrustMatrix(ctx, client)
	if err != nil {
		return fmt.Errorf("fetch trust matrix: %w", err)
	}
	log.Info("ccadb trust matrix fetched", "rows", len(matrix))

	pems, err := fetchAllPEMs(ctx, client, log)
	if err != nil {
		return fmt.Errorf("fetch PEMs: %w", err)
	}
	log.Info("ccadb PEMs fetched", "count", len(pems))

	// Per-store fingerprint lists.
	perStore := map[string][]string{
		"apple":     {},
		"chrome":    {},
		"microsoft": {},
		"mozilla":   {},
	}

	// Process each matrix row. Preferred path: we have a PEM, so upsert the
	// cert (inserting if new). Fallback: no PEM but the cert already exists
	// locally from a prior scan — flip the trust_anchor flag in place. Only
	// rows resolved to an existing DB cert get per-store membership, since
	// root_store_anchors.fingerprint FKs certificates.fingerprint.
	upserted, marked, missing := 0, 0, 0
	for _, e := range matrix {
		if cert, ok := pems[e.fingerprint]; ok {
			rec := certificates.ExtractCertificateRecord(cert)
			row := &db.Certificate{
				Fingerprint:    rec.Fingerprint,
				PEM:            rec.PEM,
				CommonName:     rec.CommonName,
				SANs:           rec.SANs,
				NotBefore:      rec.NotBefore,
				NotAfter:       rec.NotAfter,
				SerialNumber:   rec.SerialNumber,
				SubjectKeyID:   rec.SubjectKeyID,
				AuthorityKeyID: rec.AuthorityKeyID,
				SubjectDNHash:  rec.SubjectDNHash,
				IssuerDNHash:   rec.IssuerDNHash,
			}
			if err := store.UpsertTrustAnchor(ctx, row); err != nil {
				log.Warn("upsert anchor failed", "fingerprint", e.fingerprint, "error", err)
				continue
			}
			upserted++
		} else {
			existed, err := store.MarkTrustAnchor(ctx, e.fingerprint)
			if err != nil {
				log.Warn("mark trust anchor failed", "fingerprint", e.fingerprint, "error", err)
				continue
			}
			if !existed {
				missing++
				continue
			}
			marked++
		}
		if e.inApple     { perStore["apple"]     = append(perStore["apple"],     e.fingerprint) }
		if e.inChrome    { perStore["chrome"]    = append(perStore["chrome"],    e.fingerprint) }
		if e.inMicrosoft { perStore["microsoft"] = append(perStore["microsoft"], e.fingerprint) }
		if e.inMozilla   { perStore["mozilla"]   = append(perStore["mozilla"],   e.fingerprint) }
	}
	log.Info("anchors processed", "upserted", upserted, "marked_existing", marked, "pem_missing", missing)

	// Apply per-store membership.
	now := time.Now().UTC()
	for storeID, fps := range perStore {
		if err := store.ReplaceRootStoreAnchors(ctx, storeID, fps); err != nil {
			log.Error("replace anchors failed", "store", storeID, "error", err)
			continue
		}
		if err := store.TouchRootStoreUpdatedAt(ctx, storeID, now); err != nil {
			log.Warn("touch updated_at failed", "store", storeID, "error", err)
		}
		log.Info("store updated", "store", storeID, "anchors", len(fps))
	}

	// Reconcile trust_anchor flags via Subject+SKI equivalence so cross-signed
	// copies of anchors (e.g. GTS Root R1 as issued by GlobalSign R1) carry
	// the same flag as the canonical self-signed anchor.
	changed, err := store.ReconcileTrustAnchorFlags(ctx)
	if err != nil {
		log.Warn("reconcile trust_anchor flags failed", "error", err)
	} else if changed > 0 {
		log.Info("trust_anchor flags reconciled", "changed", changed)
	}
	return nil
}

// fetchTrustMatrix downloads and parses AllIncludedRootCertsCSV.
// Columns (as of 2026-04): CA Owner, Certificate Name, Apple Status, Apple Trust Bits,
// Google Chrome Status, Microsoft Status, Microsoft EKUs, Mozilla Status,
// Mozilla Trust Bits, SHA-256 Fingerprint.
func fetchTrustMatrix(ctx context.Context, client *http.Client) ([]trustEntry, error) {
	body, err := httpGet(ctx, client, urlTrustMatrix)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	r := csv.NewReader(body)
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	col := headerIndex(header)

	var out []trustEntry
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read row: %w", err)
		}
		fp := normalizeFingerprint(row[col["SHA-256 Fingerprint"]])
		if fp == "" {
			continue
		}
		e := trustEntry{
			fingerprint: fp,
			// Apple's trust bits use OID-style EKU names (e.g. "serverAuth;
			// clientAuth"), unlike Mozilla's "Websites".
			inApple: row[col["Apple Status"]] == "Included" &&
				strings.Contains(row[col["Apple Trust Bits"]], "serverAuth"),
			// Chrome Root Program in this CSV has no per-trust-bit breakdown;
			// inclusion implies TLS trust.
			inChrome: row[col["Google Chrome Status"]] == "Included",
			inMicrosoft: row[col["Microsoft Status"]] == "Included" &&
				strings.Contains(row[col["Microsoft EKUs"]], "Server Authentication"),
			inMozilla: row[col["Mozilla Status"]] == "Included" &&
				strings.Contains(row[col["Mozilla Trust Bits"]], "Websites"),
		}
		out = append(out, e)
	}
	return out, nil
}

// fetchAllPEMs pulls both Mozilla and Microsoft PEM bundles and returns a
// fingerprint->parsed-cert map. Overlap is expected and deduplicated.
func fetchAllPEMs(ctx context.Context, client *http.Client, log *slog.Logger) (map[string]*x509.Certificate, error) {
	out := make(map[string]*x509.Certificate)

	mozCerts, err := fetchMozillaPEMs(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("mozilla pems: %w", err)
	}
	for fp, c := range mozCerts {
		out[fp] = c
	}
	log.Info("mozilla PEM bundle parsed", "count", len(mozCerts))

	msCerts, err := fetchMicrosoftPEMs(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("microsoft pems: %w", err)
	}
	for fp, c := range msCerts {
		if _, exists := out[fp]; !exists {
			out[fp] = c
		}
	}
	log.Info("microsoft PEM bundle parsed", "count", len(msCerts))

	return out, nil
}

// fetchMozillaPEMs parses a concatenated-PEM text bundle.
func fetchMozillaPEMs(ctx context.Context, client *http.Client) (map[string]*x509.Certificate, error) {
	body, err := httpGet(ctx, client, urlMozillaPEMTXT)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	buf, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	return parsePEMBlob(buf), nil
}

// fetchMicrosoftPEMs parses a single-column CSV whose "PEM" field contains
// a quoted PEM block (Excel-safe leading apostrophe is stripped).
func fetchMicrosoftPEMs(ctx context.Context, client *http.Client) (map[string]*x509.Certificate, error) {
	body, err := httpGet(ctx, client, urlMicrosoftPEMs)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	r := csv.NewReader(body)
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	col := headerIndex(header)
	idx, ok := col["PEM"]
	if !ok {
		return nil, fmt.Errorf("PEM column not found in microsoft bundle")
	}

	out := make(map[string]*x509.Certificate)
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read row: %w", err)
		}
		if idx >= len(row) {
			continue
		}
		pemText := strings.TrimPrefix(row[idx], "'")
		for fp, cert := range parsePEMBlob([]byte(pemText)) {
			out[fp] = cert
		}
	}
	return out, nil
}
