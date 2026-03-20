# Dockerfile.server — multi-stage build for the API server container image.
#
# Build args for version stamping (pass from CI):
#   --build-arg VERSION=$(git describe --tags --always)
#   --build-arg COMMIT=$(git rev-parse --short HEAD)
#   --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ─── Stage 1: frontend ────────────────────────────────────────────────────────
FROM node:22-alpine AS web

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ─── Stage 2: Go binary ───────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_TIME=unknown

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

# Install swag pinned to the version in go.mod.
RUN go install github.com/swaggo/swag/cmd/swag@v1.16.6

COPY . .
# Overlay the compiled frontend so the embed picks it up.
COPY --from=web /app/web/dist ./web/dist

# Generate Swagger docs (produces docs/docs.go imported by cmd/server).
RUN swag init -g ./cmd/server/main.go

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w \
      -X github.com/tlsentinel/tlsentinel-server/internal/version.Version=${VERSION} \
      -X github.com/tlsentinel/tlsentinel-server/internal/version.Commit=${COMMIT} \
      -X github.com/tlsentinel/tlsentinel-server/internal/version.BuildTime=${BUILD_TIME}" \
    -o /out/server ./cmd/server

# ─── Stage 3: minimal runtime image ──────────────────────────────────────────
FROM gcr.io/distroless/static-debian12

COPY --from=builder /out/server /server
COPY --from=builder /app/migrations /migrations

EXPOSE 8080
ENTRYPOINT ["/server"]
