# TLSentinel

A self-hosted TLS certificate and host monitoring platform. TLSentinel tracks certificate expiry, TLS version support, and cipher suite hygiene across your infrastructure via lightweight distributed scanners.

## Features

- **Certificate tracking** — monitor expiry, chain validity, and fingerprints
- **TLS profile scanning** — detect TLS 1.0/1.1 support, weak ciphers, and preferred cipher selection
- **Host management** — associate hosts with their active certificates and scan status
- **Distributed scanners** — deploy multiple scanner agents, each scoped to specific hosts
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
│               server                 │  cmd/server
│  REST API · Swagger docs · React UI  │
│  JWT auth · embedded migrations      │
└─────────────────┬────────────────────┘
                  │
         PostgreSQL database

┌──────────────────────────────────────┐
│               scanner                │  cmd/scanner
│  Polls API for assigned hosts        │
│  TLS certificate probing             │
│  TLS version + cipher enumeration    │
│  Reports results back to API         │
└──────────────────────────────────────┘
```

The **server** and **scanner** are separate binaries. Multiple scanner instances can run in different network segments and all report back to a single server.

## Getting Started

### Prerequisites

- Go 1.25+
- Node.js 22+ (to build the web UI)
- PostgreSQL 14+

### Run locally

**1. Install frontend dependencies**

```sh
git clone https://github.com/your-org/TLSentinelAPI.git
cd TLSentinelAPI
cd web && npm install && cd ..
```

**2. Set environment variables**

```sh
# Server
export DATABASE_URL="postgres://user:password@localhost:5432/certmonitor?sslmode=disable"
export JWT_SECRET="change-me-to-a-long-random-string"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="changeme"
```

**3. Apply database migrations**

```sh
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

**4. Start the server**

```sh
make run
```

The UI is available at `http://localhost:8080` and Swagger at `http://localhost:8080/api-docs/index.html`.

**5. Start a scanner**

Create a scanner token in **Settings → Scanners**, then:

```sh
export TLSENTINEL_API_URL="http://localhost:8080"
export TLSENTINEL_API_TOKEN="<token-from-ui>"

make run-scanner
```

## Building

```sh
# Build server + scanner for all platforms (linux, darwin, windows · amd64/arm64)
make build
make build-scanner

# Binaries are written to bin/
# e.g. bin/server_linux_amd64, bin/scanner_darwin_arm64
```

## Docker

### Server

```sh
docker build \
  --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t tlsentinel-server .

docker run -p 8080:8080 \
  -e DATABASE_URL="postgres://..." \
  -e JWT_SECRET="..." \
  -e ADMIN_USERNAME="admin" \
  -e ADMIN_PASSWORD="changeme" \
  tlsentinel-server
```

### Scanner

```sh
docker build -f Dockerfile.scanner -t tlsentinel-scanner .

docker run \
  -e TLSENTINEL_API_URL="https://your-server" \
  -e TLSENTINEL_API_TOKEN="<scanner-token>" \
  tlsentinel-scanner
```

## Environment Variables

### Server

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret used to sign JWT tokens |
| `ADMIN_USERNAME` | ✅ | Username for the bootstrapped admin account |
| `ADMIN_PASSWORD` | ✅ | Password for the bootstrapped admin account |

### Scanner

| Variable | Required | Description |
|---|---|---|
| `TLSENTINEL_API_URL` | ✅ | Base URL of the TLSentinel server |
| `TLSENTINEL_API_TOKEN` | ✅ | Scanner token created in Settings → Scanners |

## Project Layout

```
cmd/
  server/       # API server + embedded web UI
  scanner/      # Scanner agent
internal/
  auth/         # JWT middleware
  certificates/ # Certificate parsing and storage
  handlers/     # HTTP handlers
  hosts/        # Host management
  models/       # Shared data models
  routes/       # Router setup
  scanners/     # Scanner registration
  tlsprofile/   # TLS profile ingestion and classification
  users/        # User management
  version/      # Build-time version stamping
migrations/     # PostgreSQL migrations (apply in order)
web/            # React + Vite + TypeScript frontend
docs/           # Auto-generated Swagger docs
```

## API Docs

Swagger UI is served at `/api-docs/index.html` when the server is running.

To regenerate after changing handler annotations:

```sh
make docs
```
