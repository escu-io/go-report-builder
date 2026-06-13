# Contributing

Thanks for your interest in improving `go-report-builder`!

## Development setup

You'll need [Go](https://go.dev/dl/) at the version pinned in [`go.mod`](go.mod).

```bash
git clone https://github.com/escu-io/go-report-builder.git
cd go-report-builder
make test
```

## Workflow

1. Fork the repository and create a topic branch from `main`.
2. Make your change. Keep the public surface (`covhtml`) small and well-documented.
3. Run the checks before opening a PR:
   ```bash
   make fmt    # gofmt
   make lint   # go vet
   make test   # tests with the race detector
   ```
4. Add or update tests for any behavior change.
5. Open a pull request describing the change and the motivation.

## Architecture

- `cmd/go-report-builder` — the CLI entry point (thin wrapper over the library).
- `covhtml` — the public, stable library API.
- `internal/` — implementation details (profile parsing, model building, discovery,
  source resolution, rendering). These are not part of the public API.
- `docs/adr/` — Architecture Decision Records. Read these before changing core
  behavior; some decisions (e.g. discovering all module files by default) are
  intentional and documented there.

## Coding conventions

- Code must be `gofmt`-formatted and pass `go vet`.
- Prefer the domain vocabulary defined in [`CONTEXT.md`](CONTEXT.md)
  (Coverage Profile, Block, Run, Merged View, Line State, etc.).
- Significant or non-obvious design decisions should be captured as a new ADR.
