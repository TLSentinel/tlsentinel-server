package audit

import (
	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

// PurgedCertsAuditCap bounds how many certs we embed in a single cert-purge
// audit row's details payload. The full deleted count is always reported
// via "deleted"; if the list was truncated, "truncated" is also set so the
// UI can flag it. 100 is a compromise between "useful for forensics" and
// "don't bloat a JSONB row" — a mass purge after a bad import could
// otherwise produce thousands of entries.
const PurgedCertsAuditCap = 100

// PurgedCertsDetails builds the Details payload for a cert-purge audit row.
// trigger is "manual" (user clicked Run Now) or "scheduled" (cron fired).
// purged is the list returned by store.PurgeUnreferencedCerts.
//
// Shape:
//
//	{
//	  "trigger":      "manual" | "scheduled",
//	  "deleted":      <total count>,
//	  "certificates": [ { "fingerprint", "commonName", "sans", "notAfter" }, ... ],
//	  "truncated":    true   // only present when the list exceeds the cap
//	}
//
// Empty purge lists still produce a row — "it ran and found nothing" is a
// valid outcome worth recording.
func PurgedCertsDetails(trigger string, purged []db.PurgedCert) map[string]any {
	details := map[string]any{
		"trigger": trigger,
		"deleted": len(purged),
	}
	if len(purged) == 0 {
		return details
	}

	limit := len(purged)
	truncated := false
	if limit > PurgedCertsAuditCap {
		limit = PurgedCertsAuditCap
		truncated = true
	}

	certs := make([]map[string]any, 0, limit)
	for _, c := range purged[:limit] {
		certs = append(certs, map[string]any{
			"fingerprint": c.Fingerprint,
			"commonName":  c.CommonName,
			"sans":        c.SANs,
			"notAfter":    c.NotAfter,
		})
	}
	details["certificates"] = certs
	if truncated {
		details["truncated"] = true
	}
	return details
}
