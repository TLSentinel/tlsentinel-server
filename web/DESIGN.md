# TLSentinel Design Language

The visual vocabulary for the TLSentinel web app. Keep this short and current —
if you add a token or a reusable component, note it here.

---

## Principles

1. **Tonal stacking over borders.** Sectioning comes from surface-tone shifts
   (`--surface` → `--surface-container` → `--surface-container-high`), not
   rules. Borders exist (`--border` → `--outline`) but are reserved for inputs,
   cards that need crispness, and "ghost" separators where a tonal shift would
   fail (e.g. a card floating over the same surface).
2. **Content, not chrome.** Tables, lists, and cards are flat by default. Lift
   is signaled through tone, type weight, and whitespace.
3. **Identifiers live in monospace.** Fingerprints, serial numbers, certificate
   IDs, OIDs, file paths — all `font-mono`.
4. **Labels are small, uppercase, tracked.** Field labels, section headers,
   breadcrumbs, and table column heads all use `FIELD_LABEL`. One rule, one
   look, applied everywhere.
5. **Never style from scratch if a token or component exists.** New pages
   should be almost entirely composed of the pieces listed below.

---

## Color tokens

Defined in [`src/index.css`](src/index.css). Palette is a Material-3-inspired
"Sentinel / Digital Vault" theme — navy authority, emerald for valid state,
ruby for expired/critical.

### Surfaces (tonal stack, lightest → darkest)

| CSS var                          | Role                                      |
| -------------------------------- | ----------------------------------------- |
| `--surface-container-lowest`     | L2 — inner cards, inputs                  |
| `--surface`                      | L0 — page background                      |
| `--surface-bright`               | Bright accent surface                     |
| `--surface-container-low`        |                                           |
| `--surface-container`            | L1 — sidebar, muted bands, secondary      |
| `--surface-container-high`       | Hover / active variants                   |
| `--surface-container-highest`    | Strongest tonal lift                      |
| `--surface-dim`                  | Dimmest surface                           |

shadcn token bridge: `--background` → `--surface`, `--card` →
`--surface-container-lowest`, `--muted` → `--surface-container`.

### Semantic colors

| Token         | Value              | Use                                   |
| ------------- | ------------------ | ------------------------------------- |
| `primary`     | navy `#000e24`     | Brand, primary buttons, active state  |
| `tertiary`    | emerald `#006d3d`  | Valid, healthy, success               |
| `error` / `destructive` | ruby `#ba1a1a` | Expired, critical, delete          |
| `warning`     | amber `#8a5a00`    | Intermediate signal (expiring soon)   |

Containers exist for each (`--primary-container`, `--tertiary-container`,
etc.) for tinted backgrounds when the solid color is too loud.

### Content

| Token                   | Use                                |
| ----------------------- | ---------------------------------- |
| `--on-surface`          | Body text                          |
| `--on-surface-variant`  | Secondary / label text (`muted-foreground`) |
| `--on-surface-muted`    | Tertiary / hint text               |

---

## Typography

### Font families

Defined as `@theme inline` tokens in [`src/index.css`](src/index.css).

| Token             | Family           | Use                                              |
| ----------------- | ---------------- | ------------------------------------------------ |
| `font-sans`       | Inter Variable   | Default body, data, forms                        |
| `font-display`    | Manrope Variable | Headings — auto-applied to all `h1`–`h6`         |
| `font-brand`      | Unica One        | Product wordmark only ("TLSENTINEL")             |
| `font-mono`       | ui-monospace     | Identifiers, code, certificate material          |

Body defaults to `font-sans`; headings auto-pick `font-display` via global
`h1–h6` rule. Never apply `font-display` manually to a heading.

### FIELD_LABEL

```ts
// src/lib/utils.ts
export const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
```

Single source of truth for the small-caps label look. Use it for:

- Form field labels (`<Label className={FIELD_LABEL}>`)
- Section headers inside cards
- Breadcrumb text (baked into `<Breadcrumb>`)
- Table column headers
- Short "or" dividers, badges masquerading as labels

If something looks like a label, it gets `FIELD_LABEL`. Do not hand-roll
`text-xs uppercase …` strings.

### Product wordmark

```tsx
<span className="font-brand text-3xl uppercase tracking-[0.05em]">TLSentinel</span>
```

- Always uppercase
- Always `tracking-[0.05em]` (sidebar/about) or `tracking-[0.15em]` (when spacious, e.g. login hero)
- Size: `text-3xl` sidebar, `text-4xl` hero/about
- Never use `font-brand` for anything other than the word "TLSentinel"

### Headings

| Level | Size            | Use                                |
| ----- | --------------- | ---------------------------------- |
| `h1`  | `text-5xl`      | Entity detail pages (endpoint, cert) |
| `h1`  | `text-2xl`      | Standard list/settings page title  |
| `h2`  | `text-base font-semibold` | Card section titles     |
| `h2`  | `text-sm font-medium`     | Muted band section titles (inside `Section`) |

---

## Reusable components

Live in [`src/components/`](src/components). If something would be the third
copy of a pattern, promote it here.

| Component                                       | Purpose                                                   |
| ----------------------------------------------- | --------------------------------------------------------- |
| [`Breadcrumb`](src/components/Breadcrumb.tsx)   | Top-of-page nav. Items array API, last item is non-linked. |
| [`ErrorAlert`](src/components/ErrorAlert.tsx)   | Destructive-toned banner. Optional `icon` prop (defaults `AlertCircle`). |
| [`BulkImportDialog`](src/components/BulkImportDialog.tsx) | CSV upload flow                                      |
| `Section`, `Row` ([endpoint/detail/shared.tsx](src/pages/endpoint/detail/shared.tsx)) | Card + label-value row primitives used on detail pages |

shadcn primitives ([`src/components/ui/`](src/components/ui/)) — use these
over hand-rolled equivalents: `Button`, `Input`, `Label`, `Textarea`, `Badge`,
`Card`, `Dialog`, `Switch`, `Separator`, `Tabs`.

---

## Layout patterns

### Page shell

```tsx
<div className="space-y-6 max-w-3xl">
  <Breadcrumb items={[{ label: 'Parent', to: '/parent' }, { label: 'Current' }]} />
  <div>
    <h1 className="text-2xl font-semibold">Page title</h1>
    <p className="mt-0.5 text-sm text-muted-foreground">Subtitle</p>
  </div>
  {/* content */}
</div>
```

- `space-y-6` is the default vertical rhythm between top-level blocks
- `max-w-3xl` for dense single-column pages; `max-w-2xl` for settings;
  full-width for dashboards and tables
- Every page starts with `<Breadcrumb>` — no exceptions except login/auth

### Cards

```tsx
<div className="rounded-xl bg-card border border-border overflow-hidden">
  <div className="px-5 py-3 bg-muted flex items-center justify-between">
    <h2 className="text-sm font-medium">Section title</h2>
  </div>
  <div className="p-5">{/* body */}</div>
</div>
```

For simpler cards use shadcn `<Card>`. Add `border border-border` when the
card floats over the same-tone surface (e.g. login over `--background`).

### Form fields

```tsx
<div className="space-y-2">
  <Label htmlFor="name" className={FIELD_LABEL}>Name</Label>
  <Input id="name" />
</div>
```

- `space-y-2` between label and input
- `space-y-4` between form groups
- Errors: `<ErrorAlert>` for prominent, `<p className="text-sm text-destructive">` for inline

### Breadcrumbs

Always via the component:

```tsx
<Breadcrumb items={[
  { label: 'Toolbox', to: '/toolbox' },
  { label: 'Certificate Decoder' },
]} />
```

Never inline `<nav>…<Link>…<ChevronRight>…`.

---

## Icons

- [lucide-react](https://lucide.dev) throughout
- Default size: `h-4 w-4` inline with text, `h-3.5 w-3.5` for dense UI, `h-5 w-5` for standalone
- Status icons: `CheckCircle2` (valid) in `text-tertiary`, `XCircle` (error) in
  `text-error`/`text-destructive`, `ShieldAlert` (warning) in `text-amber-500`

---

## Buttons

| Variant       | When                                         |
| ------------- | -------------------------------------------- |
| `default`     | Primary action. Navy gradient. One per view. |
| `outline`     | Secondary action (Cancel, Edit, Back)        |
| `ghost`       | Low-weight action (Clear, inline toggles)    |
| `destructive` | Delete, revoke. Always confirm.              |
| `secondary`   | Rarely — for segmented chips                 |

Sizes: `default` (h-8), `sm` (h-7), `lg` (h-9), `xs` (h-6), and `icon` variants.

---

## Where things live

```
src/
├── components/
│   ├── ui/              # shadcn primitives — don't re-implement
│   ├── layout/          # AppShell, GlobalSearch
│   ├── Breadcrumb.tsx   # reusable app patterns
│   └── ErrorAlert.tsx
├── lib/
│   ├── utils.ts         # cn(), FIELD_LABEL, date formatters
│   ├── tag-colors.ts    # categoryColor()
│   └── cert-utils.ts    # DN_FIELDS, decodeCert, etc.
├── pages/               # one file per page
│   └── <area>/          # endpoint/, certificates/, toolbox/, settings/
├── api/                 # one file per resource
└── types/api.ts         # all shared API types
```

One page per file, one API module per resource. No co-located "helpers.ts"
files unless the helper is genuinely page-local.
