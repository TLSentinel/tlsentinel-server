package totp

import "time"

// nowUTC is wrapped in a var so tests can stub the clock without touching
// time.Now globally.
var nowUTC = func() time.Time { return time.Now().UTC() }
