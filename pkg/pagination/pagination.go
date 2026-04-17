// Package pagination parses and clamps list-endpoint pagination parameters.
package pagination

import (
	"net/http"
	"strconv"
)

// Parse reads "page" and "page_size" from the request query string and clamps
// them to safe ranges. page defaults to 1 (min 1, unbounded above); pageSize
// defaults to defaultSize and is clamped to [1, maxSize]. Callers should pick
// defaults appropriate to the resource (e.g. 20 for user-facing lists,
// 50 for audit-style tables).
func Parse(r *http.Request, defaultSize, maxSize int) (page, pageSize int) {
	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	pageSize, err = strconv.Atoi(r.URL.Query().Get("page_size"))
	if err != nil || pageSize < 1 {
		pageSize = defaultSize
	}
	if pageSize > maxSize {
		pageSize = maxSize
	}
	return page, pageSize
}
