package certificates

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// parseIngestRequest validates that exactly one certificate format is provided
// and dispatches to the appropriate parser based on the field supplied.
func parseIngestRequest(req IngestCertificateRequest) (*x509.Certificate, error) {
	hasPEM := strings.TrimSpace(req.CertificatePEM) != ""
	hasDER := strings.TrimSpace(req.CertificateDERBase64) != ""

	if hasPEM == hasDER {
		return nil, errors.New("must provide exactly one of certificatePem or certificateDerBase64")
	}

	if hasPEM {
		return parsePEMCertificate(req.CertificatePEM)
	}

	return parseBase64DERCertificate(req.CertificateDERBase64)
}

// parsePEMCertificate decodes and parses a PEM-encoded certificate string,
// returning the parsed certificate and its common name.
func parsePEMCertificate(pemStr string) (*x509.Certificate, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}
	if block.Type != "CERTIFICATE" {
		return nil, fmt.Errorf("expected PEM type CERTIFICATE, got %s", block.Type)
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	return cert, nil
}

// parseBase64DERCertificate decodes a base64-encoded DER certificate and parses it,
// returning the parsed certificate and its common name.
func parseBase64DERCertificate(derBase64 string) (*x509.Certificate, error) {
	derBytes, err := base64.StdEncoding.DecodeString(derBase64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	cert, err := x509.ParseCertificate(derBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	return cert, nil
}

// firstOrEmpty returns the first element of a string slice, or "" if empty.
func firstOrEmpty(ss []string) string {
	if len(ss) > 0 {
		return ss[0]
	}
	return ""
}

// keyAlgorithmName returns a human-readable name for the certificate's public key algorithm.
func keyAlgorithmName(cert *x509.Certificate) string {
	switch cert.PublicKeyAlgorithm {
	case x509.RSA:
		return "RSA"
	case x509.ECDSA:
		return "ECDSA"
	case x509.Ed25519:
		return "Ed25519"
	case x509.DSA:
		return "DSA"
	default:
		return "Unknown"
	}
}

// keyBitSize returns the key size in bits, or 0 if it cannot be determined.
func keyBitSize(cert *x509.Certificate) int {
	switch k := cert.PublicKey.(type) {
	case *rsa.PublicKey:
		return k.N.BitLen()
	case *ecdsa.PublicKey:
		return k.Curve.Params().BitSize
	case ed25519.PublicKey:
		return 256
	default:
		return 0
	}
}

// keyUsageStrings returns human-readable names for the set bits in a KeyUsage bitmask.
func keyUsageStrings(usage x509.KeyUsage) []string {
	type bit struct {
		flag x509.KeyUsage
		name string
	}
	bits := []bit{
		{x509.KeyUsageDigitalSignature, "Digital Signature"},
		{x509.KeyUsageContentCommitment, "Content Commitment"},
		{x509.KeyUsageKeyEncipherment, "Key Encipherment"},
		{x509.KeyUsageDataEncipherment, "Data Encipherment"},
		{x509.KeyUsageKeyAgreement, "Key Agreement"},
		{x509.KeyUsageCertSign, "Certificate Sign"},
		{x509.KeyUsageCRLSign, "CRL Sign"},
		{x509.KeyUsageEncipherOnly, "Encipher Only"},
		{x509.KeyUsageDecipherOnly, "Decipher Only"},
	}
	var result []string
	for _, b := range bits {
		if usage&b.flag != 0 {
			result = append(result, b.name)
		}
	}
	if result == nil {
		return []string{}
	}
	return result
}

// extKeyUsageStrings returns human-readable names for a slice of ExtKeyUsage values.
func extKeyUsageStrings(usages []x509.ExtKeyUsage) []string {
	names := map[x509.ExtKeyUsage]string{
		x509.ExtKeyUsageAny:                            "Any",
		x509.ExtKeyUsageServerAuth:                     "TLS Web Server Authentication",
		x509.ExtKeyUsageClientAuth:                     "TLS Web Client Authentication",
		x509.ExtKeyUsageCodeSigning:                    "Code Signing",
		x509.ExtKeyUsageEmailProtection:                "Email Protection",
		x509.ExtKeyUsageIPSECEndSystem:                 "IPSEC End System",
		x509.ExtKeyUsageIPSECTunnel:                    "IPSEC Tunnel",
		x509.ExtKeyUsageIPSECUser:                      "IPSEC User",
		x509.ExtKeyUsageTimeStamping:                   "Time Stamping",
		x509.ExtKeyUsageOCSPSigning:                    "OCSP Signing",
		x509.ExtKeyUsageMicrosoftServerGatedCrypto:     "Microsoft Server Gated Crypto",
		x509.ExtKeyUsageNetscapeServerGatedCrypto:      "Netscape Server Gated Crypto",
		x509.ExtKeyUsageMicrosoftCommercialCodeSigning: "Microsoft Commercial Code Signing",
		x509.ExtKeyUsageMicrosoftKernelCodeSigning:     "Microsoft Kernel Code Signing",
	}
	var result []string
	for _, u := range usages {
		if name, ok := names[u]; ok {
			result = append(result, name)
		} else {
			result = append(result, fmt.Sprintf("Unknown(%d)", u))
		}
	}
	if result == nil {
		return []string{}
	}
	return result
}

// EnrichDetail populates the extended fields of a CertificateDetail by parsing
// the stored PEM. This is called after fetching the record from the database.
func EnrichDetail(detail *models.CertificateDetail, cert *x509.Certificate) {
	detail.SubjectOrg = firstOrEmpty(cert.Subject.Organization)
	detail.SubjectOrgUnit = firstOrEmpty(cert.Subject.OrganizationalUnit)
	detail.IssuerCN = cert.Issuer.CommonName
	detail.IssuerOrg = firstOrEmpty(cert.Issuer.Organization)
	detail.KeyAlgorithm = keyAlgorithmName(cert)
	detail.KeySize = keyBitSize(cert)
	detail.SignatureAlgorithm = cert.SignatureAlgorithm.String()
	detail.KeyUsages = keyUsageStrings(cert.KeyUsage)
	detail.ExtKeyUsages = extKeyUsageStrings(cert.ExtKeyUsage)

	if cert.OCSPServer != nil {
		detail.OCSPURLs = cert.OCSPServer
	} else {
		detail.OCSPURLs = []string{}
	}

	if cert.CRLDistributionPoints != nil {
		detail.CRLDistributionPoints = cert.CRLDistributionPoints
	} else {
		detail.CRLDistributionPoints = []string{}
	}
}

func extractCertificateRecord(cert *x509.Certificate) models.CertificateRecord {
	fingerprint := sha256.Sum256(cert.Raw)

	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: cert.Raw,
	})

	sans := cert.DNSNames
	if sans == nil {
		sans = []string{}
	}

	var authorityKeyId *string
	if len(cert.AuthorityKeyId) > 0 {
		s := hex.EncodeToString(cert.AuthorityKeyId)
		authorityKeyId = &s
	}

	return models.CertificateRecord{
		Fingerprint:    hex.EncodeToString(fingerprint[:]),
		PEM:            string(pemBytes),
		CommonName:     cert.Subject.CommonName,
		SANs:           sans,
		NotBefore:      cert.NotBefore,
		NotAfter:       cert.NotAfter,
		SerialNumber:   cert.SerialNumber.String(),
		SubjectKeyID:   hex.EncodeToString(cert.SubjectKeyId),
		AuthorityKeyID: authorityKeyId,
	}
}
