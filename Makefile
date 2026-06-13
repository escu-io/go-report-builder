BINARY := go-report-builder
PKG := ./cmd/go-report-builder

.PHONY: all build test lint fmt tidy report clean help

all: lint test build ## Lint, test, and build

build: ## Build the CLI binary
	go build -o $(BINARY) $(PKG)

test: ## Run all tests with the race detector
	go test -race ./...

lint: ## Run go vet
	go vet ./...

fmt: ## Format all Go files
	gofmt -w .

tidy: ## Tidy go.mod / go.sum
	go mod tidy

report: build ## Self-test: build a coverage report of this repo
	go test -coverprofile=cover.out ./...
	./$(BINARY) -o coverage-report.html cover.out

clean: ## Remove build and report artifacts
	rm -f $(BINARY) cover.out coverage-report.html

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
