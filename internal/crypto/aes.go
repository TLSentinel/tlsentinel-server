// Package crypto provides AES-256-GCM encryption helpers used to store
// sensitive configuration values (e.g. SMTP passwords) in the database.
//
// The encryption key is loaded from the TLSENTINEL_ENCRYPTION_KEY environment
// variable, which must be a base64-encoded 32-byte random value.
//
// Generate a suitable key with:
//
//	openssl rand -base64 32
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
)

// ErrNoKey is returned by Encryptor when no encryption key has been configured.
var ErrNoKey = errors.New("TLSENTINEL_ENCRYPTION_KEY is not set")

// Encryptor wraps an AES-256-GCM key and exposes Encrypt/Decrypt methods.
// An Encryptor created with a nil key returns ErrNoKey on every operation,
// so callers never need to nil-check the key themselves.
type Encryptor struct {
	key []byte
}

// NewEncryptor returns an Encryptor for key. If key is nil (e.g. the env var
// was not set) every Encrypt/Decrypt call will return ErrNoKey.
func NewEncryptor(key []byte) *Encryptor {
	return &Encryptor{key: key}
}

// Encrypt encrypts plaintext and returns a base64-encoded ciphertext.
// Returns ErrNoKey if no encryption key was provided at construction time.
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	if len(e.key) == 0 {
		return "", ErrNoKey
	}
	return Encrypt(e.key, plaintext)
}

// Decrypt decrypts a base64-encoded ciphertext produced by Encrypt.
// Returns ErrNoKey if no encryption key was provided at construction time.
func (e *Encryptor) Decrypt(encoded string) (string, error) {
	if len(e.key) == 0 {
		return "", ErrNoKey
	}
	return Decrypt(e.key, encoded)
}

// LoadEncryptionKey reads TLSENTINEL_ENCRYPTION_KEY, base64-decodes it, and
// validates that it is exactly 32 bytes (required for AES-256).
// Returns a non-nil error if the variable is absent or malformed.
func LoadEncryptionKey() ([]byte, error) {
	val := os.Getenv("TLSENTINEL_ENCRYPTION_KEY")
	if val == "" {
		return nil, errors.New("TLSENTINEL_ENCRYPTION_KEY is not set")
	}
	key, err := base64.StdEncoding.DecodeString(val)
	if err != nil {
		return nil, fmt.Errorf("TLSENTINEL_ENCRYPTION_KEY is not valid base64: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("TLSENTINEL_ENCRYPTION_KEY must decode to 32 bytes, got %d", len(key))
	}
	return key, nil
}

// Encrypt encrypts plaintext using AES-256-GCM and returns a base64-encoded
// string whose byte layout is: [nonce (12 bytes)] [ciphertext + tag].
func Encrypt(key []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	// Seal appends the ciphertext+tag after the nonce.
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt; returns the original plaintext or an error if the
// ciphertext is invalid or the key is wrong.
func Decrypt(key []byte, encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("invalid ciphertext encoding: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm: %w", err)
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed (wrong key?): %w", err)
	}
	return string(plaintext), nil
}
