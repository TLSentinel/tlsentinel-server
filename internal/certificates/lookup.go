package certificates

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"time"
)

// dialTimeout bounds a single dial+handshake attempt when the caller ctx
// has no deadline of its own.
const dialTimeout = 10 * time.Second

// dialAndFetchCert opens a TLS connection to host:port and returns the leaf
// certificate from the server's certificate chain. Honors ctx cancellation
// for both the TCP dial and the TLS handshake.
func dialAndFetchCert(ctx context.Context, host string, port int) (*x509.Certificate, error) {
	ctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	addr := fmt.Sprintf("%s:%d", host, port)

	d := &tls.Dialer{
		NetDialer: &net.Dialer{},
		Config: &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: false, // honour trust chain; caller inspects validity separately
		},
	}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		// If ctx was cancelled or deadline exceeded, do not retry — surface it.
		if ctx.Err() != nil {
			return nil, fmt.Errorf("TLS dial failed: %w", err)
		}
		// Retry with verification disabled so we still return cert data for
		// expired / self-signed certs — the caller surfaces validity to the user.
		d.Config = &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: true,
		}
		conn, err = d.DialContext(ctx, "tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("TLS dial failed: %w", err)
		}
	}
	defer conn.Close()

	tlsConn, ok := conn.(*tls.Conn)
	if !ok {
		return nil, fmt.Errorf("unexpected non-TLS connection to %s", addr)
	}

	certs := tlsConn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return nil, fmt.Errorf("no certificates returned by %s", addr)
	}

	return certs[0], nil
}
