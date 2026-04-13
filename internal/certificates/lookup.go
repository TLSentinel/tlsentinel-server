package certificates

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"time"
)

// dialAndFetchCert opens a TLS connection to host:port and returns the leaf
// certificate from the server's certificate chain.
func dialAndFetchCert(ctx context.Context, host string, port int) (*x509.Certificate, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	addr := fmt.Sprintf("%s:%d", host, port)

	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: false, // honour trust chain; caller can inspect validity separately
	})
	if err != nil {
		// Retry with verification disabled so we still return cert data for
		// expired / self-signed certs — the caller surfaces validity to the user.
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: true,
		})
		if err != nil {
			return nil, fmt.Errorf("TLS dial failed: %w", err)
		}
	}
	defer conn.Close()

	_ = ctx // context respected via Dialer.Timeout; extend if needed

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return nil, fmt.Errorf("no certificates returned by %s", addr)
	}

	return certs[0], nil
}
