-- certificate_trust holds the per-root-program trust verdict for each
-- leaf, as evaluated by the in-process x509.Verify() path in
-- internal/trust.
--
-- One row per (fingerprint, root_store_id). `trusted` is the verdict;
-- `reason` is the error message from Verify() when trusted=FALSE, empty
-- when TRUE. `evaluated_at` is stamped on each upsert so callers can tell
-- how fresh the answer is.
--
-- Populated by:
--   * trust.Evaluator on every leaf ingest (probe.Handler.Result)
--   * trust.Evaluator.ReevaluateAll after rootstore.Refresh completes
--
-- Read by:
--   * store.GetChainTrustedBy — replaces the old recursive-CTE path
--
-- FKs CASCADE so cert deletion cleans up verdicts; root-store deletion
-- cleans up its column of the matrix.
CREATE TABLE IF NOT EXISTS tlsentinel.certificate_trust (
    fingerprint    TEXT        NOT NULL REFERENCES tlsentinel.certificates(fingerprint) ON DELETE CASCADE,
    root_store_id  TEXT        NOT NULL REFERENCES tlsentinel.root_stores(id)            ON DELETE CASCADE,
    trusted        BOOLEAN     NOT NULL,
    reason         TEXT        NOT NULL DEFAULT '',
    evaluated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fingerprint, root_store_id)
);

-- Useful when rendering "which certs does program X trust" list views.
CREATE INDEX IF NOT EXISTS certificate_trust_store_trusted_idx
    ON tlsentinel.certificate_trust (root_store_id, trusted);
