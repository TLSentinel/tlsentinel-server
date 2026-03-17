.PHONY: run build clean docker swagger frontend
# =============================================================================
# Variables
# =============================================================================

# Version stamping
VERSION    := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT     := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
PKG        := github.com/tlsentinel/tlsentinel-server/internal/version
LDFLAGS    := -ldflags "-X $(PKG).Version=$(VERSION) -X $(PKG).Commit=$(COMMIT) -X $(PKG).BuildTime=$(BUILD_TIME)"

# Directories / commands
BIN_DIR     := bin
CMD := ./cmd/server

# Source file lists (used for incremental generation)
WEB_SOURCES := $(shell find $(WEB_DIR) -type f -not -path "*/node_modules/*" -not -path "*/dist/*")
GO_SOURCES  := $(shell find . -name "*.go" -type f -not -path "./internal/db/*")

# Cross-compilation targets (local build)
PLATFORMS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64

# Container images
IMAGE_REPO := tlsentinel

# =============================================================================
# Code Generation
# =============================================================================

# Regenerates only when Go source files change
docs/docs.go: $(GO_SOURCES)
	@echo "Generating Swagger docs..."
	swag init -g $(CMD)/main.go

# Rebuilds only when web source files change
web/.build_stamp: $(WEB_SOURCES)
	@echo "Building frontend..."
	cd $(WEB_DIR) && npm install && npm run build
	@touch $@

swagger:  docs/docs.go

frontend: web/.build_stamp

# =============================================================================
# Local Build (requires Go)
# =============================================================================

define cross_compile
	@for platform in $(PLATFORMS); do \
		os=$$(echo $$platform | cut -d/ -f1); \
		arch=$$(echo $$platform | cut -d/ -f2); \
		ext=$$([ "$$os" = "windows" ] && echo ".exe" || echo ""); \
		echo "  Building $(1) for $$os/$$arch..."; \
		GOOS=$$os GOARCH=$$arch CGO_ENABLED=0 go build $(LDFLAGS) \
			-o $(BIN_DIR)/$(1)_$${os}_$${arch}$${ext} $(2) || exit 1; \
	done
endef

run: swagger frontend
	go run $(LDFLAGS) $(CMD)

build: swagger frontend
	$(call cross_compile,server,$(CMD))

# =============================================================================
# Container Images
# =============================================================================
# Builds production images tagged :VERSION and :latest.
# Override IMAGE_REPO for a registry push, e.g.:
#   make docker-images IMAGE_REPO=ghcr.io/yourorg/tlsentinel

docker:
	docker build -f Dockerfile \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_TIME=$(BUILD_TIME) \
		-t $(IMAGE_REPO)/tlsentinel-server:$(VERSION) \
		-t $(IMAGE_REPO)/tlsentinel-server:latest \
		.

clean:
	rm -rf $(BIN_DIR) docs/ $(WEB_DIR)/.build_stamp
