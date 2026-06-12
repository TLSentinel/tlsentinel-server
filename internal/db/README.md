# Database schema

This package holds all DB access (`*_store.go`) and the bun model definitions
(`schema.go`). The schema itself is owned by the numbered SQL files in
[`../../migrations`](../../migrations) — those are the source of truth; bun
models mirror them for the query layer.

## Entity-relationship diagram

[`schema.d2`](schema.d2) is a hand-maintained [D2](https://d2lang.com) diagram
of the full schema (30 tables across 7 domains), rendered to
[`schema.svg`](schema.svg).

Re-render after any schema change:

```sh
make schema-diagram          # from products/server/, writes schema.svg
make schema-diagram SCHEMA_DIAGRAM_FORMAT=png   # raster copy instead
```

Requires `d2` (`brew install d2`). The diagram lives next to `schema.go` on
purpose — whoever edits a model or adds a migration sees the source here and
should update it in the same change.

### Reading the diagram

- Each box is a table; **PK** / **FK** badges mark key columns.
- Edge labels carry the foreign key's `ON DELETE` behavior:
  - `CASCADE` — child rows deleted with the parent.
  - `SET NULL` — child FK nulled, row survives.
  - `NO ACTION` — delete blocked while the reference exists (a retention
    guard). The two red `NO ACTION` edges from `endpoint_certs` and
    `endpoint_scan_history` into `certificates` are deliberate: scan history
    gates the certificate lifecycle, so a cert is never deleted out from under
    the history that observed it. The nightly purge pipeline removes history
    first, then prunes the now-unreferenced certs.
- `audit_logs.user_id` is drawn as a dashed "soft ref" — it has **no** FK on
  purpose, so an audit entry survives the deletion of the user it names.
