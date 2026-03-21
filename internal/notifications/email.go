package notifications

import (
	"fmt"
	"strings"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// expirySubject returns the email subject line for a certificate expiry alert.
func expirySubject(cert models.ExpiringCertItem, thresholdDays int) string {
	switch thresholdDays {
	case 1:
		return fmt.Sprintf("TLSentinel: Certificate expiring TODAY — %s:%d", cert.DNSName, cert.Port)
	default:
		return fmt.Sprintf("TLSentinel: Certificate expiring in %d days — %s:%d", thresholdDays, cert.DNSName, cert.Port)
	}
}

// expiryBody returns the plain-text email body for a certificate expiry alert.
func expiryBody(cert models.ExpiringCertItem, thresholdDays int) string {
	var sb strings.Builder

	sb.WriteString("TLSentinel Certificate Expiry Alert\r\n")
	sb.WriteString("====================================\r\n\r\n")

	urgency := fmt.Sprintf("expiring in %d days", thresholdDays)
	if thresholdDays <= 1 {
		urgency = "expiring TODAY"
	}
	sb.WriteString(fmt.Sprintf("The following certificate is %s and requires attention.\r\n\r\n", urgency))

	sb.WriteString(fmt.Sprintf("  Host:          %s\r\n", cert.HostName))
	sb.WriteString(fmt.Sprintf("  Address:       %s:%d\r\n", cert.DNSName, cert.Port))
	sb.WriteString(fmt.Sprintf("  Common Name:   %s\r\n", cert.CommonName))
	sb.WriteString(fmt.Sprintf("  Expires:       %s\r\n", cert.NotAfter.UTC().Format(time.RFC1123)))
	sb.WriteString(fmt.Sprintf("  Days Left:     %d\r\n", cert.DaysRemaining))
	sb.WriteString(fmt.Sprintf("  Fingerprint:   %s\r\n", cert.Fingerprint))

	sb.WriteString("\r\nPlease renew this certificate before it expires.\r\n")
	sb.WriteString("\r\n---\r\nTLSentinel\r\n")

	return sb.String()
}
