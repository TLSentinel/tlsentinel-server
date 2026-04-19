package tlsprofile

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
)

// KeyExchangeBitsFromPEM returns an effective key-strength estimate in
// RSA-equivalent bits, derived from the server certificate's public key.
// This is the cheap path: it reuses the cert we already store and does not
// require any extra handshake probing.
//
// The return value is normalised to the RSA-equivalent strength scale that
// the SSL Labs scoring thresholds (512 / 1024 / 2048 / 4096) are defined
// against. For EC keys, raw curve bits are mapped to their NIST SP 800-57
// RSA-equivalent (P-256 ≈ 3072, P-384 ≈ 7680, P-521 ≈ 15360, Ed25519 ≈ 3072)
// so an ECDSA P-256 cert does not score as "< 1024 bits" on the RSA scale.
//
// Returns -1 if the key type is not recognised, so the caller can fall back
// to treating key-exchange as unknown and skip the sub-score.
func KeyExchangeBitsFromPEM(pemData string) (int, error) {
	if pemData == "" {
		return -1, errors.New("empty pem")
	}

	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return -1, errors.New("failed to decode pem")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return -1, err
	}

	switch pub := cert.PublicKey.(type) {
	case *rsa.PublicKey:
		return pub.N.BitLen(), nil
	case *ecdsa.PublicKey:
		return ecCurveBitsToRSAEquiv(pub.Curve.Params().BitSize), nil
	case ed25519.PublicKey:
		// Ed25519 ~ 128-bit security, same as P-256.
		return 3072, nil
	default:
		return -1, nil
	}
}

// ecCurveBitsToRSAEquiv maps an EC curve size (in bits) to its
// RSA-equivalent strength per NIST SP 800-57. Unknown curves fall back to
// a linear approximation so unexpected sizes don't silently fail open.
func ecCurveBitsToRSAEquiv(curveBits int) int {
	switch {
	case curveBits >= 512: // P-521.
		return 15360
	case curveBits >= 384: // P-384.
		return 7680
	case curveBits >= 256: // P-256, X25519.
		return 3072
	case curveBits >= 224: // P-224.
		return 2048
	case curveBits >= 192: // P-192.
		return 1024
	default:
		return 512
	}
}
