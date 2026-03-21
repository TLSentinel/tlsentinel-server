<p align="center">
  <picture>
    <img src="https://tlsentinel.github.io/assets/tlsentinel_logo_light_horizontal.png" alt="TLSentinel" />
  </picture>
</p>

<h1 align="center">TLSentinel — Server</h1>

<p align="center">
  A self-hosted TLS certificate monitoring platform. Track expiry, TLS hygiene, and cipher suite health across your infrastructure.
</p>

<h3 align="center">
  <a href="#-getting-started">Getting Started</a>
  <span> · </span>
  <a href="#-environment-variables">Configuration</a>
  <span> · </span>
  <a href="https://github.com/tlsentinel/tlsentinel-scanner">Scanner Agent</a>
</h3>

<br/>

## Features

- **Certificate tracking** — expiry, chain validity, fingerprints
- **TLS profile scanning** — detect TLS 1.0/1.1, weak ciphers, preferred cipher selection
- **Host management** — associate hosts with certificates and scan status
- **Distributed scanners** — multiple agents, each scoped to specific hosts
- **Mail notifications** — SMTP alerts when certificates approach expiry

## Getting Started

The recommended deployment is Docker. Pull the image from GHCR:

```sh
docker pull ghcr.io/tlsentinel/tlsentinel-server:latest
```

Configure the required environment variables below, point it at a PostgreSQL database, and start it. Migrations run automatically on startup.

## Environment Variables


| Variable | Description |
|---|---|
| `TLSENTINEL_DB_HOST` | Hostname (default: `localhost`) |
| `TLSENTINEL_DB_PORT` | Port (default: `5432`) |
| `TLSENTINEL_DB_NAME` | Database name (default: `tlsentinel`) |
| `TLSENTINEL_DB_USERNAME` | Username |
| `TLSENTINEL_DB_PASSWORD` | Password |
| `TLSENTINEL_DB_SSLMODE` | SSL mode (default: `disable`) |
| `TLSENTINEL_JWT_SECRET` | JWT signing secret (min 32 chars). Generate: `openssl rand -hex 32` |
| `TLSENTINEL_ADMIN_USERNAME` | Bootstrapped admin username |
| `TLSENTINEL_ADMIN_PASSWORD` | Bootstrapped admin password |
| `TLSENTINEL_ENCRYPTION_KEY` | AES-256 key for encrypting SMTP passwords at rest. Generate: `openssl rand -base64 32` |

## 🗂️ Project Layout

```
cmd/server/             # Entry point
internal/
  auth/                 # JWT middleware, scanner token auth
  certificates/         # Certificate parsing and storage
  crypto/               # AES encryption helpers
  dashboard/            # Dashboard aggregate queries
  db/                   # Database access (bun ORM)
  hosts/                # Host management
  mail/                 # SMTP sender and config
  models/               # Shared request/response types
  notifications/        # Certificate expiry alert emails
  probe/                # Scanner-facing API
  routes/               # Router setup (chi)
  scanners/             # Scanner token management
  scheduler/            # In-process cron scheduler
  tlsprofile/           # TLS version/cipher profile ingestion
  users/                # User management
  version/              # Build-time version stamping
migrations/             # PostgreSQL migration files (auto-applied on startup)
web/                    # React + Vite + TypeScript + shadcn/ui frontend
```

## License

MIT — see [LICENSE](LICENSE).
