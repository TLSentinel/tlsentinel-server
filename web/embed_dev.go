//go:build dev

package web

import (
	"io/fs"
	"testing/fstest"
)

// FS is a stub used in dev mode (-tags dev). The real frontend is served by
// the Vite dev server at :5173 — run 'make dev-ui' and access the app there.
// The Go server only handles API requests in this mode.
var FS fs.FS = fstest.MapFS{
	"dist/index.html": &fstest.MapFile{
		Data: []byte(`<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=http://localhost:5173">
<title>TLSentinel — Dev Mode</title>
</head><body>
Dev mode: frontend served by Vite at <a href="http://localhost:5173">http://localhost:5173</a>
</body></html>`),
	},
}
