package tlsprofile

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
)

// KeyExchangeBitsFromPEM returns an effective key-strength-in-bits estimate
// derived from the server certificate's public key. This is the cheap path:
// it reuses the cert we already store and does not require any extra handshake
// probing. It approximates the server's key-exchange strength well enough for
// the SSL Labs sub-score when the key is RSA (whose modulus size bounds the
// RSA key-exchange strength) or ECDSA / Ed25519 (where the curve size is the
// ECDHE strength in practice when an ECDSA cert is served).
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
		return pub.Curve.Params().BitSize, nil
	case ed25519.PublicKey:
		return 256, nil
	default:
		return -1, nil
	}
}
