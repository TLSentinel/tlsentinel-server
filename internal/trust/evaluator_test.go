package trust

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"sync"
	"testing"
	"time"
)

// chain holds a minted cert in both parsed and PEM form so tests can feed
// either to the evaluator (DB path wants PEM, AddIntermediate wants parsed).
type chain struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
	pem  string
}

// mintCA mints a self-signed CA using the given subject common name.
func mintCA(t *testing.T, cn string) chain {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen CA key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create CA cert: %v", err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse CA cert: %v", err)
	}
	return chain{cert: parsed, key: key, pem: toPEM(t, der)}
}

// mintIntermediate mints a CA cert signed by parent.
func mintIntermediate(t *testing.T, cn string, parent chain) chain {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen int key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(2),
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent.cert, &key.PublicKey, parent.key)
	if err != nil {
		t.Fatalf("create int cert: %v", err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse int cert: %v", err)
	}
	return chain{cert: parsed, key: key, pem: toPEM(t, der)}
}

// mintLeaf mints a non-CA leaf signed by parent. EKU=ServerAuth because
// that is what the evaluator requires.
func mintLeaf(t *testing.T, cn string, parent chain) chain {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen leaf key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(3),
		Subject:               pkix.Name{CommonName: cn},
		DNSNames:              []string{cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  false,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent.cert, &key.PublicKey, parent.key)
	if err != nil {
		t.Fatalf("create leaf cert: %v", err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse leaf cert: %v", err)
	}
	return chain{cert: parsed, key: key, pem: toPEM(t, der)}
}

func toPEM(t *testing.T, der []byte) string {
	t.Helper()
	var buf bytes.Buffer
	if err := pem.Encode(&buf, &pem.Block{Type: "CERTIFICATE", Bytes: der}); err != nil {
		t.Fatalf("encode PEM: %v", err)
	}
	return buf.String()
}

// fakeSource is an in-memory PoolSource/CertSource/TrustSink for tests.
type fakeSource struct {
	mu             sync.Mutex
	anchorsByStore map[string][]string
	nonAnchors     map[string]string
	allCerts       map[string]string // fingerprint → PEM, for ForEachCert
	verdicts       map[string]map[string]Result
	upsertErr      error
}

func (f *fakeSource) ListAnchorPEMsByStore(_ context.Context) (map[string][]string, error) {
	return f.anchorsByStore, nil
}

func (f *fakeSource) ListNonAnchorCertPEMs(_ context.Context) (map[string]string, error) {
	return f.nonAnchors, nil
}

func (f *fakeSource) ForEachCert(_ context.Context, fn func(fingerprint, pemStr string) error) error {
	for fp, p := range f.allCerts {
		if err := fn(fp, p); err != nil {
			return err
		}
	}
	return nil
}

func (f *fakeSource) UpsertCertificateTrust(_ context.Context, fingerprint string, verdicts map[string]Result) error {
	if f.upsertErr != nil {
		return f.upsertErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.verdicts == nil {
		f.verdicts = map[string]map[string]Result{}
	}
	f.verdicts[fingerprint] = verdicts
	return nil
}

// TestLoadPoolsAndEvaluate builds two independent programs (apple, mozilla)
// with different roots and asserts a leaf is trusted only by the program
// whose root chained to its issuer.
func TestLoadPoolsAndEvaluate(t *testing.T) {
	appleRoot := mintCA(t, "Apple Test Root")
	mozillaRoot := mintCA(t, "Mozilla Test Root")
	appleInt := mintIntermediate(t, "Apple Int CA", appleRoot)
	leaf := mintLeaf(t, "example.test", appleInt)

	src := &fakeSource{
		anchorsByStore: map[string][]string{
			"apple":   {appleRoot.pem},
			"mozilla": {mozillaRoot.pem},
		},
		nonAnchors: map[string]string{
			"int": appleInt.pem, // CA → lands in intermediates pool
		},
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}

	verdicts := ev.Evaluate(leaf.cert)
	if got := verdicts["apple"]; !got.Trusted {
		t.Errorf("expected leaf trusted by apple, got %+v", got)
	}
	if got := verdicts["mozilla"]; got.Trusted {
		t.Errorf("expected leaf NOT trusted by mozilla, got %+v", got)
	}
	if verdicts["mozilla"].Reason == "" {
		t.Error("expected a reason string on untrusted verdict")
	}

	stores := ev.Stores()
	if len(stores) != 2 || stores[0] != "apple" || stores[1] != "mozilla" {
		t.Errorf("Stores() = %v, want [apple mozilla]", stores)
	}
}

// TestAddIntermediateEnablesTrust verifies the scanner-driven intermediates
// pool growth: a leaf that can't verify without a freshly-submitted
// intermediate succeeds after AddIntermediate is called.
func TestAddIntermediateEnablesTrust(t *testing.T) {
	root := mintCA(t, "Late Root")
	intCA := mintIntermediate(t, "Late Int", root)
	leaf := mintLeaf(t, "late.test", intCA)

	src := &fakeSource{
		anchorsByStore: map[string][]string{
			"apple": {root.pem},
		},
		nonAnchors: map[string]string{}, // no intermediates pre-loaded
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}

	// Before AddIntermediate: chain can't be built, so untrusted.
	if got := ev.Evaluate(leaf.cert)["apple"]; got.Trusted {
		t.Fatalf("expected leaf untrusted before intermediate added, got %+v", got)
	}

	// After: trusted.
	ev.AddIntermediate(intCA.cert)
	if got := ev.Evaluate(leaf.cert)["apple"]; !got.Trusted {
		t.Errorf("expected leaf trusted after intermediate added, got %+v", got)
	}
}

// TestAddIntermediateIgnoresLeaf verifies that AddIntermediate does NOT
// pollute the intermediates pool with non-CA certs. A leaf stuffed in as
// an "intermediate" must not satisfy path-building for another leaf.
func TestAddIntermediateIgnoresLeaf(t *testing.T) {
	root := mintCA(t, "Root")
	leaf := mintLeaf(t, "leaf.test", root)
	other := mintLeaf(t, "other.test", root)

	src := &fakeSource{
		anchorsByStore: map[string][]string{"apple": {root.pem}},
		nonAnchors:     map[string]string{},
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}

	ev.AddIntermediate(leaf.cert) // should be a no-op because !IsCA
	// Snapshot size indirectly: if AddIntermediate added the leaf,
	// evaluating `other` against apple would still work (direct chain), so
	// the sharper assertion is that the internal intermediates pool stays
	// functionally empty. Use Subjects() as a byte-equal sanity check.
	ev.mu.RLock()
	gotSubjects := ev.intermediates.Subjects() //nolint:staticcheck // deprecated but tolerable in tests
	ev.mu.RUnlock()
	if len(gotSubjects) != 0 {
		t.Errorf("intermediates pool should be empty after adding a non-CA leaf, got %d subjects", len(gotSubjects))
	}

	// Sanity: the other leaf still verifies directly off root.
	if got := ev.Evaluate(other.cert)["apple"]; !got.Trusted {
		t.Errorf("direct-chain leaf should be trusted, got %+v", got)
	}
}

// TestLoadPoolsFiltersLeavesFromIntermediates ensures non-CA certs in the
// non-anchor set do NOT end up in the intermediates pool.
func TestLoadPoolsFiltersLeavesFromIntermediates(t *testing.T) {
	root := mintCA(t, "Root")
	intCA := mintIntermediate(t, "Int", root)
	leafA := mintLeaf(t, "a.test", intCA)
	leafB := mintLeaf(t, "b.test", intCA)

	src := &fakeSource{
		anchorsByStore: map[string][]string{"apple": {root.pem}},
		nonAnchors: map[string]string{
			"int": intCA.pem,
			"lfA": leafA.pem, // leaf — must be filtered out
		},
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}

	// leafB should still verify via the intermediate that DID make it in.
	if got := ev.Evaluate(leafB.cert)["apple"]; !got.Trusted {
		t.Errorf("leafB should be trusted (int is in pool), got %+v", got)
	}

	ev.mu.RLock()
	subjects := ev.intermediates.Subjects() //nolint:staticcheck // deprecated but tolerable in tests
	ev.mu.RUnlock()
	// We expect exactly one entry (the intermediate), not two (no leaf).
	if len(subjects) != 1 {
		t.Errorf("intermediates pool should contain exactly 1 cert, got %d", len(subjects))
	}
}

// TestReevaluateAllPersistsVerdicts walks every cert via the CertSource
// and writes the verdict map via TrustSink. Covers the startup-backfill
// and post-refresh paths.
func TestReevaluateAllPersistsVerdicts(t *testing.T) {
	root := mintCA(t, "Root")
	leaf := mintLeaf(t, "leaf.test", root)
	foreignRoot := mintCA(t, "Foreign")
	foreignLeaf := mintLeaf(t, "foreign.test", foreignRoot)

	src := &fakeSource{
		anchorsByStore: map[string][]string{"apple": {root.pem}},
		nonAnchors:     map[string]string{},
		allCerts: map[string]string{
			"fp-leaf":    leaf.pem,
			"fp-foreign": foreignLeaf.pem,
		},
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}
	if err := ev.ReevaluateAll(context.Background(), src); err != nil {
		t.Fatalf("ReevaluateAll: %v", err)
	}

	if v, ok := src.verdicts["fp-leaf"]["apple"]; !ok || !v.Trusted {
		t.Errorf("fp-leaf/apple verdict: got=%+v ok=%v, want trusted=true", v, ok)
	}
	if v, ok := src.verdicts["fp-foreign"]["apple"]; !ok || v.Trusted {
		t.Errorf("fp-foreign/apple verdict: got=%+v ok=%v, want trusted=false", v, ok)
	}
}

// TestReevaluateAllCoversAnchorsAndIntermediates is the regression test
// for the "Amazon Root CA 1 shows as untrusted by everything" bug: the
// root-store page lists a cert as an anchor of Microsoft's program, the
// user clicks in, and the old code produced an empty matrix because the
// CA was silently skipped. After the fix, every cert — anchor, intermediate,
// and leaf — gets its own verdict row.
func TestReevaluateAllCoversAnchorsAndIntermediates(t *testing.T) {
	// One program (apple) with a single anchor. An intermediate chains to
	// the anchor; a leaf chains to the intermediate.
	anchor := mintCA(t, "Root")
	intCA := mintIntermediate(t, "Intermediate", anchor)
	leaf := mintLeaf(t, "leaf.test", intCA)

	src := &fakeSource{
		anchorsByStore: map[string][]string{"apple": {anchor.pem}},
		nonAnchors:     map[string]string{"int": intCA.pem},
		// Every cert — including the anchor — is in allCerts, because
		// the DB table doesn't filter by IsCA or trust_anchor anymore.
		allCerts: map[string]string{
			"fp-anchor": anchor.pem,
			"fp-int":    intCA.pem,
			"fp-leaf":   leaf.pem,
		},
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}
	if err := ev.ReevaluateAll(context.Background(), src); err != nil {
		t.Fatalf("ReevaluateAll: %v", err)
	}

	// Anchor verifies against its own program's pool (chain-of-one).
	if v, ok := src.verdicts["fp-anchor"]["apple"]; !ok || !v.Trusted {
		t.Errorf("fp-anchor/apple: got=%+v ok=%v, want trusted=true", v, ok)
	}
	// Intermediate chains to the anchor.
	if v, ok := src.verdicts["fp-int"]["apple"]; !ok || !v.Trusted {
		t.Errorf("fp-int/apple: got=%+v ok=%v, want trusted=true", v, ok)
	}
	// Leaf chains to the intermediate to the anchor.
	if v, ok := src.verdicts["fp-leaf"]["apple"]; !ok || !v.Trusted {
		t.Errorf("fp-leaf/apple: got=%+v ok=%v, want trusted=true", v, ok)
	}
	// All three fingerprints got a row — no silent skips.
	if len(src.verdicts) != 3 {
		t.Errorf("expected verdicts for 3 certs, got %d: %v", len(src.verdicts), keysOf(src.verdicts))
	}
}

func keysOf(m map[string]map[string]Result) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// TestEvaluateNilLeaf guards against panic and returns an empty map.
func TestEvaluateNilLeaf(t *testing.T) {
	ev := New(nil)
	if got := ev.Evaluate(nil); len(got) != 0 {
		t.Errorf("Evaluate(nil) = %v, want empty map", got)
	}
}

// TestExpiredLeafUntrusted verifies that validity-period enforcement comes
// for free from x509.Verify — this is one of the reasons we moved away
// from the name-match CTE.
func TestExpiredLeafUntrusted(t *testing.T) {
	root := mintCA(t, "Root")
	// Mint a leaf with NotAfter in the past.
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(9),
		Subject:               pkix.Name{CommonName: "expired.test"},
		DNSNames:              []string{"expired.test"},
		NotBefore:             time.Now().Add(-48 * time.Hour),
		NotAfter:              time.Now().Add(-1 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, root.cert, &key.PublicKey, root.key)
	if err != nil {
		t.Fatalf("create expired leaf: %v", err)
	}
	expired, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse expired leaf: %v", err)
	}

	src := &fakeSource{
		anchorsByStore: map[string][]string{"apple": {root.pem}},
		nonAnchors:     map[string]string{},
	}
	ev := New(nil)
	if err := ev.LoadPools(context.Background(), src); err != nil {
		t.Fatalf("LoadPools: %v", err)
	}

	if got := ev.Evaluate(expired)["apple"]; got.Trusted {
		t.Errorf("expired leaf should be untrusted, got %+v", got)
	}
}
