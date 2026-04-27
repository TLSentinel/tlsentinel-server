package rootstore

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// normalizeFingerprint strips non-hex characters (CCADB uses colon-separated
// uppercase hex, e.g. "CB:3C:...") and lowercases. Matches the plain
// lowercase-hex format produced by certificates.ExtractCertificateRecord.
func normalizeFingerprint(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= 'a' && r <= 'f':
			b.WriteRune(r)
		case r >= 'A' && r <= 'F':
			b.WriteRune(r + ('a' - 'A'))
		}
	}
	return b.String()
}

// httpGet returns the response body for a GET request, with non-2xx treated
// as an error. Caller must close the returned reader.
func httpGet(ctx context.Context, client *http.Client, url string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return resp.Body, nil
}

// headerIndex builds a column-name -> index map from a CSV header row.
func headerIndex(header []string) map[string]int {
	m := make(map[string]int, len(header))
	for i, h := range header {
		m[h] = i
	}
	return m
}

// parsePEMBlob walks PEM blocks in raw bytes, returning fingerprint->cert for
// every successfully parsed CERTIFICATE block. Fingerprint is lowercase hex
// SHA-256 of the DER bytes.
func parsePEMBlob(data []byte) map[string]*x509.Certificate {
	out := make(map[string]*x509.Certificate)
	for len(data) > 0 {
		block, rest := pem.Decode(data)
		if block == nil {
			break
		}
		data = rest
		if block.Type != "CERTIFICATE" {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			continue
		}
		sum := sha256.Sum256(cert.Raw)
		out[hex.EncodeToString(sum[:])] = cert
	}
	return out
}
