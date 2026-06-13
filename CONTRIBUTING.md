# Contributing

Thanks for your interest in improving `go-report-builder`!

## Development setup

You'll need [Go](https://go.dev/dl/) at the version pinned in [`go.mod`](go.mod).

```bash
git clone https://github.com/escu-io/go-report-builder.git
cd go-report-builder
make test
```

Optional (matches CI / release tooling):

- [golangci-lint](https://golangci-lint.run/welcome/install/) **v2.4.0+** — `make lint-ci` (required for Go 1.25)
- [git-cliff](https://git-cliff.org/docs/installation/) — `make changelog`
- [GoReleaser](https://goreleaser.com/) — local dry-run: `goreleaser release --snapshot --clean`

## Workflow

1. Fork the repository and create a topic branch from `main`.
2. Make your change. Keep the public surface (`covhtml`) small and well-documented.
3. Run the checks before opening a PR:
   ```bash
   make fmt       # gofmt
   make lint      # go vet
   make lint-ci   # golangci-lint (optional locally, required in CI)
   make test      # tests with the race detector
   ```
4. Add or update tests for any behavior change.
5. Open a pull request describing the change and the motivation.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) so changelogs and semver releases stay automatic:

| Prefix | Release bump | Example |
|--------|--------------|---------|
| `feat:` | minor | `feat: add JSON export option` |
| `fix:` | patch | `fix: treemap layout for single-file packages` |
| `feat!:` or footer `BREAKING CHANGE:` | major | `feat!: rename ProfileInput fields` |
| `docs:`, `test:`, `chore:`, `ci:` | none | `docs: add CI integration example` |

## Releases (maintainers)

1. Ensure `main` is green and changes use conventional commits.
2. Run `make changelog` to refresh the `[Unreleased]` section (or `./scripts/changelog.sh vX.Y.Z` when cutting).
3. Run `VERSION=X.Y.Z make release` (or `BUMP=patch|minor|major make release`).
4. GitHub Actions runs GoReleaser on the tag and publishes binaries + GitHub Release.

Dry run: `VERSION=0.2.0 make release-dry-run`

## Architecture

- `cmd/go-report-builder` — the CLI entry point (thin wrapper over the library).
- `covhtml` — the public, stable library API.
- `internal/` — implementation details (profile parsing, model building, discovery,
  source resolution, rendering). These are not part of the public API.
- `docs/adr/` — Architecture Decision Records. Read these before changing core
  behavior; some decisions (e.g. discovering all module files by default) are
  intentional and documented there.

## Coding conventions

- Code must be `gofmt`-formatted and pass `go vet` and `golangci-lint`.
- Prefer the domain vocabulary defined in [`CONTEXT.md`](CONTEXT.md)
  (Coverage Profile, Block, Run, Merged View, Line State, etc.).
- Significant or non-obvious design decisions should be captured as a new ADR.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
