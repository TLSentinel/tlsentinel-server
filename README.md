![TLSentinel](https://tlsentinel.github.io/assets/tlsentinel_logo_light_horizontal.png)

# TLSentinel — Server

A self-hosted TLS certificate and host monitoring platform. TLSentinel tracks certificate expiry, TLS version support, and cipher suite hygiene across your infrastructure via lightweight distributed scanners.

This repository contains the **server** component. The companion scanner agent lives at [tlsentinel/tlsentinel-scanner](https://github.com/tlsentinel/tlsentinel-scanner).

## Features

- **Certificate tracking** — monitor expiry, chain validity, and fingerprints
- **TLS profile scanning** — detect TLS 1.0/1.1 support, weak ciphers, and preferred cipher selection
- **Host management** — associate hosts with their active certificates and scan status
- **Distributed scanners** — deploy multiple scanner agents, each scoped to specific hosts
- **Mail notifications** — configurable SMTP alerts when certificates approach expiry
- **Role-based access** — JWT-authenticated API with user management
- **REST API** — fully documented via Swagger UI at `/api-docs/index.html`
- **Web UI** — React dashboard embedded directly in the server binary

## Architecture

```
┌──────────────────────────────────────┐
│          Browser / API Client        │
└─────────────────┬────────────────────┘
                  │ HTTP
┌─────────────────▼────────────────────┐
│         tlsentinel-server            │
│  REST API · Swagger docs · React UI  │
│  JWT auth · embedded migrations      │
└─────────────────┬────────────────────┘
                  │
         PostgreSQL database
                  │
┌─────────────────▼────────────────────┐
│         tlsentinel-scanner           │  (separate binary / repo)
│  Polls API for assigned hosts        │
│  TLS certificate probing             │
│  TLS version + cipher enumeration    │
│  Reports results back to API         │
└──────────────────────────────────────┘
```

The server and one or more scanner agents communicate over HTTP. Scanners can run in isolated network segments and all report back to a single server.

## Getting Started

### Prerequisites

- Go 1.25+
- Node.js 22+ (to build the web UI)
- PostgreSQL 14+

### Run locally

**1. Clone and install frontend dependencies**

```sh
git clone https://github.com/tlsentinel/tlsentinel-server.git
cd tlsentinel-server
cd web && npm install && cd ..
```

**2. Configure environment**

```sh
cp env.example .env
# Edit .env — at minimum set TLSENTINEL_JWT_SECRET, TLSENTINEL_ADMIN_PASSWORD,
# and your database connection details.
```

Key variables (see [Environment Variables](#environment-variables) for the full list):

```sh
TLSENTINEL_DB_HOST=localhost
TLSENTINEL_DB_PORT=5432
TLSENTINEL_DB_NAME=tlsentinel
TLSENTINEL_DB_USERNAME=tlsentinel
TLSENTINEL_DB_PASSWORD=changeme
TLSENTINEL_JWT_SECRET=<openssl rand -hex 32>
TLSENTINEL_ADMIN_USERNAME=admin
TLSENTINEL_ADMIN_PASSWORD=changeme
```

**3. Apply database migrations**

```sh
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Or use the provided `docker-compose.yml` at the monorepo root — the `db` service applies migrations automatically on first run.

**4. Start the server**

```sh
make run
```

The UI is available at `http://localhost:8080` and Swagger at `http://localhost:8080/api-docs/index.html`.

**5. Connect a scanner**

Create a scanner token in **Settings → Scanners**, then configure and run [tlsentinel-scanner](https://github.com/tlsentinel/tlsentinel-scanner).

## Building

```sh
# Build server binary for the current platform
make build

# Binaries are written to bin/
# e.g. bin/server_linux_amd64, bin/server_darwin_arm64
```

Cross-compilation targets: `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64`.

## Docker

```sh
# Build the production image (distroless runtime, embeds frontend + Swagger docs)
make docker

# Or build manually:
docker build \
  --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t tlsentinel/tlsentinel-server:latest \
  .

docker run -p 8080:8080 \
  -e TLSENTINEL_DB_HOST=db \
  -e TLSENTINEL_DB_NAME=tlsentinel \
  -e TLSENTINEL_DB_USERNAME=tlsentinel \
  -e TLSENTINEL_DB_PASSWORD=changeme \
  -e TLSENTINEL_JWT_SECRET=... \
  -e TLSENTINEL_ADMIN_USERNAME=admin \
  -e TLSENTINEL_ADMIN_PASSWORD=changeme \
  tlsentinel/tlsentinel-server:latest
```

See the `docker-compose.yml` at the monorepo root for a full local stack including the database and scanner.

## Environment Variables

### Database connection

Provide either a full URL **or** the individual components:

| Variable | Description |
|---|---|
| `TLSENTINEL_DATABASE_URL` | Full PostgreSQL connection string |
| `TLSENTINEL_DB_HOST` | Hostname (default: `localhost`) |
| `TLSENTINEL_DB_PORT` | Port (default: `5432`) |
| `TLSENTINEL_DB_NAME` | Database name (default: `tlsentinel`) |
| `TLSENTINEL_DB_USERNAME` | Username |
| `TLSENTINEL_DB_PASSWORD` | Password |
| `TLSENTINEL_DB_SSLMODE` | SSL mode (default: `disable`) |

### Server

| Variable | Required | Description |
|---|---|---|
| `TLSENTINEL_JWT_SECRET` | ✅ | Secret used to sign JWT tokens (min 32 chars). Generate: `openssl rand -hex 32` |
| `TLSENTINEL_ADMIN_USERNAME` | ✅ | Username for the bootstrapped admin account |
| `TLSENTINEL_ADMIN_PASSWORD` | ✅ | Password for the bootstrapped admin account |
| `TLSENTINEL_ENCRYPTION_KEY` | | AES-256 key for encrypting SMTP passwords at rest. Generate: `openssl rand -base64 32` |

## Project Layout

```
cmd/
  server/         # Entry point — starts the API server with embedded web UI
internal/
  auth/           # JWT middleware, identity context, scanner token auth
  certificates/   # Certificate parsing and storage
  crypto/         # AES encryption helpers
  dashboard/      # Dashboard aggregate query handler
  db/             # All database access (bun ORM)
  handlers/       # Generic HTTP handlers (health, version)
  hosts/          # Host management handlers
  mail/           # SMTP mail sender and config handler
  models/         # Shared request/response models
  probe/          # Scanner-facing probe API (config, hosts, results)
  routes/         # Router setup (chi)
  scanners/       # Scanner token management handlers
  scheduler/      # In-process cron scheduler (nightly maintenance jobs)
  tlsprofile/     # TLS version/cipher profile ingestion and classification
  users/          # User management handlers
  version/        # Build-time version stamping
migrations/       # Sequential PostgreSQL migration files
web/              # React + Vite + TypeScript + shadcn/ui frontend
docs/             # Auto-generated Swagger docs (gitignored, built at compile time)
```

## API Docs

Swagger UI is served at `/api-docs/index.html` when the server is running.

To regenerate after changing handler annotations:

```sh
make swagger
```

## License

MIT — see [LICENSE](LICENSE).
