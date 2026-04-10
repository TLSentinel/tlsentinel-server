package notifications

// DefaultTemplate holds the subject, body, and format for a built-in notification template.
type DefaultTemplate struct {
	Subject string // empty string for channels with no subject (e.g. webhook)
	Body    string
	Format  string // "html" or "text"
}

// defaultKey is the lookup key for the defaults map.
type defaultKey struct {
	EventType string
	Channel   string
}

// Defaults contains all built-in notification templates keyed by (event_type, channel).
// When no DB override exists, the handler falls back to these values.
var Defaults = map[defaultKey]DefaultTemplate{
	{EventType: "cert_expiring", Channel: "email"}: {
		Format:  "html",
		Subject: "Certificate expiring in {{.DaysRemaining}} days — {{.EndpointName}}",
		Body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#18181b;padding:20px 32px;">
          <span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:-0.01em;">TLSentinel</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#18181b;">
            Certificate Expiring in {{.DaysRemaining}} Days
          </h2>
          <p style="margin:0 0 24px;font-size:14px;color:#71717a;">
            The following certificate requires attention.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;width:130px;">Endpoint</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;font-weight:500;">{{.EndpointName}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Type</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;">{{.EndpointType}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Common Name</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;">{{.CommonName}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Expires</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;">{{.NotAfter}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Days Left</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-weight:600;color:#dc2626;">{{.DaysRemaining}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#71717a;">Fingerprint</td>
              <td style="padding:10px 0;color:#18181b;font-family:monospace;font-size:12px;">{{.Fingerprint}}</td>
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:14px;color:#71717a;">
            Please renew this certificate before it expires.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">TLSentinel — Certificate Monitoring</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
	},

	{EventType: "cert_expired", Channel: "email"}: {
		Format:  "html",
		Subject: "Certificate EXPIRED — {{.EndpointName}}",
		Body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#dc2626;padding:20px 32px;">
          <span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:-0.01em;">TLSentinel</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#18181b;">
            Certificate Expired
          </h2>
          <p style="margin:0 0 24px;font-size:14px;color:#71717a;">
            The following certificate has expired and requires immediate attention.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;width:130px;">Endpoint</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;font-weight:500;">{{.EndpointName}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Type</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;">{{.EndpointType}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Common Name</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#18181b;">{{.CommonName}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">Expired</td>
              <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#dc2626;font-weight:600;">{{.NotAfter}}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#71717a;">Fingerprint</td>
              <td style="padding:10px 0;color:#18181b;font-family:monospace;font-size:12px;">{{.Fingerprint}}</td>
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:14px;color:#71717a;">
            Please renew this certificate immediately.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">TLSentinel — Certificate Monitoring</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
	},
}

// TemplateVariables lists the available template variables per event type.
var TemplateVariables = map[string][]TemplateVariable{
	"cert_expiring": {
		{Name: "EndpointName", Description: "Endpoint display name"},
		{Name: "EndpointType", Description: "Endpoint type (e.g. tls, http)"},
		{Name: "CommonName", Description: "Certificate common name"},
		{Name: "NotAfter", Description: "Certificate expiry date"},
		{Name: "DaysRemaining", Description: "Days until expiry"},
		{Name: "Fingerprint", Description: "Certificate SHA-256 fingerprint"},
	},
	"cert_expired": {
		{Name: "EndpointName", Description: "Endpoint display name"},
		{Name: "EndpointType", Description: "Endpoint type"},
		{Name: "CommonName", Description: "Certificate common name"},
		{Name: "NotAfter", Description: "Certificate expiry date"},
		{Name: "Fingerprint", Description: "Certificate SHA-256 fingerprint"},
	},
}

// TemplateVariable describes a single available variable for a template.
type TemplateVariable struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// GetDefault returns the embedded default for the given event type and channel,
// and whether it exists.
func GetDefault(eventType, channel string) (DefaultTemplate, bool) {
	t, ok := Defaults[defaultKey{EventType: eventType, Channel: channel}]
	return t, ok
}

// AllEventTypes returns all known event types in display order.
var AllEventTypes = []string{
	"cert_expiring",
	"cert_expired",
}

// AllChannels returns all known channels in display order.
var AllChannels = []string{
	"email",
}

// EventTypeLabels maps event_type keys to human-readable labels.
var EventTypeLabels = map[string]string{
	"cert_expiring": "Certificate Expiring",
	"cert_expired":  "Certificate Expired",
}
