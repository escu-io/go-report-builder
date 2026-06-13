BINARY := go-report-builder
PKG := ./cmd/go-report-builder
GOLANGCI_LINT ?= golangci-lint
GIT_CLIFF ?= git-cliff

.PHONY: all build test lint fmt tidy report clean help \
        lint-ci changelog release-dry-run release

all: lint test build ## Lint, test, and build

build: ## Build the CLI binary
	go build -o $(BINARY) $(PKG)

test: ## Run all tests with the race detector
	go test -race ./...

lint: ## Run go vet
	go vet ./...

lint-ci: ## Run golangci-lint (same as CI)
	@command -v $(GOLANGCI_LINT) >/dev/null 2>&1 || { \
		echo "Install golangci-lint: https://golangci-lint.run/welcome/install/"; exit 1; \
	}
	$(GOLANGCI_LINT) run ./...

fmt: ## Format all Go files
	gofmt -w .

tidy: ## Tidy go.mod / go.sum
	go mod tidy

report: build ## Self-test: build a coverage report of this repo
	go test -coverprofile=cover.out ./...
	./$(BINARY) -o coverage-report.html cover.out

changelog: ## Refresh [Unreleased] in CHANGELOG.md (requires git-cliff)
	./scripts/changelog.sh --unreleased

release-dry-run: ## Show release steps without tagging (VERSION=0.2.0)
	@test -n "$(VERSION)" || (echo "Set VERSION=0.2.0"; exit 1)
	./scripts/release.sh --dry-run $(VERSION)

release: ## Tag and push a release (VERSION=0.2.0 or BUMP=patch|minor|major)
	@if [ -n "$(BUMP)" ]; then \
		./scripts/release.sh --bump $(BUMP); \
	elif [ -n "$(VERSION)" ]; then \
		./scripts/release.sh $(VERSION); \
	else \
		echo "Set VERSION=0.2.0 or BUMP=patch|minor|major"; exit 1; \
	fi

clean: ## Remove build and report artifacts
	rm -f $(BINARY) cover.out coverage-report.html

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
