# go-report-builder

[![Go Reference](https://pkg.go.dev/badge/github.com/escu-io/go-report-builder.svg)](https://pkg.go.dev/github.com/escu-io/go-report-builder)
[![Go Report Card](https://goreportcard.com/badge/github.com/escu-io/go-report-builder)](https://goreportcard.com/report/github.com/escu-io/go-report-builder)
[![CI](https://github.com/escu-io/go-report-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/escu-io/go-report-builder/actions/workflows/ci.yml)
[![Lint](https://github.com/escu-io/go-report-builder/actions/workflows/lint.yml/badge.svg)](https://github.com/escu-io/go-report-builder/actions/workflows/lint.yml)
[![Release](https://github.com/escu-io/go-report-builder/actions/workflows/release.yml/badge.svg)](https://github.com/escu-io/go-report-builder/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/escu-io/go-report-builder)](https://github.com/escu-io/go-report-builder/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Go Version](https://img.shields.io/github/go-mod/go-version/escu-io/go-report-builder)](go.mod)

Generate rich, interactive, **self-contained** HTML coverage reports from standard
Go coverage profiles (`go test -coverprofile`). Use it as a CLI or embed it in your
own tooling via the [`covhtml`](https://pkg.go.dev/github.com/escu-io/go-report-builder/covhtml) package.

The generated report bundles its own CSS and JavaScript into a single HTML file —
open it directly in a browser or publish it as a static CI artifact with zero runtime
dependencies.

## Features

- **Treemap** — zoomable map sized by statements, colored by coverage %
- **Tree** — collapsible package/file hierarchy with progress bars
- **File Detail** — syntax-highlighted source with per-line states (Covered, Partial, Uncovered, Not-Tracked)
- **Run filter** — compare which runs covered each file (union/Merged View)
- **Theme toggle** — dark (default) and light modes
- **Whole-module discovery** — untested files show up as 0% instead of silently disappearing

## Installation

### As a CLI

```bash
go install github.com/escu-io/go-report-builder/cmd/go-report-builder@latest
```

### As a library

```bash
go get github.com/escu-io/go-report-builder@latest
```

### From source

```bash
git clone https://github.com/escu-io/go-report-builder.git
cd go-report-builder
go build -o go-report-builder ./cmd/go-report-builder
```

## CLI usage

```bash
# Generate a report from one or more coverage profiles
go test -coverprofile=cover.out ./...
go-report-builder -o coverage-report.html cover.out

# Multiple runs (union / Merged View)
go-report-builder -run-names "unit,integration" unit.out integration.out

# Profile-exact scope (no module discovery)
go-report-builder --profile-only cover.out

# Override module root and pass build tags
go-report-builder --root /path/to/module --tags integration,e2e cover.out
```

| Flag           | Default                       | Description                                                        |
| -------------- | ----------------------------- | ------------------------------------------------------------------ |
| `-config`      | `.go-coverage-report.yaml`    | Path to the YAML config file (optional)                            |
| `-o`           | `coverage-report.html`        | Output HTML file path                                              |
| `-root`        | auto-detect from go.mod       | Module root directory                                              |
| `-tags`        | (none)                        | Comma-separated build tags honored during discovery               |
| `-run-names`   | (filename)                    | Comma-separated labels for profiles, in the same order as the args |
| `-profile-only`| `false`                       | Only include files present in the profiles (disables discovery)    |

Open the generated HTML file in any browser.

## CI integration

Publish an HTML artifact from GitHub Actions (downloadable from each workflow run):

```yaml
# .github/workflows/coverage-report.yml — full example in docs/examples/
- run: go test -race -coverprofile=cover.out ./...
- run: go install github.com/escu-io/go-report-builder/cmd/go-report-builder@latest
- run: go-report-builder -o coverage-report.html cover.out
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage-report.html
```

See [`docs/examples/github-actions-coverage-report.yml`](docs/examples/github-actions-coverage-report.yml).

## Config file

Instead of passing flags every time, drop a `.go-coverage-report.yaml` file in your
working directory (or point at one with `-config`). Everything you can set in the file
is also available as a flag, and vice versa.

```yaml
# .go-coverage-report.yaml
output: coverage-report.html   # -o
root: ""                       # -root (empty = auto-detect from go.mod)
profileOnly: false             # -profile-only
buildTags:                     # -tags
  - integration
profiles:                      # positional args + -run-names
  - path: unit.out
    label: unit
  - path: integration.out
    label: integration
```

Each `profiles` entry may be written in full (`path:` + optional `label:`) or as a bare
string when you don't need a label:

```yaml
profiles:
  - unit.out
  - integration.out
```

**Precedence:** the config file provides the defaults; any flag you pass on the command
line overrides the matching config value. Passing positional profile arguments replaces
the file's `profiles` list entirely (with `-run-names` supplying their labels). When you
pass `-config` explicitly, a missing file is an error; the default path is silently
ignored when absent.

## Library usage

Full API documentation lives on
[pkg.go.dev](https://pkg.go.dev/github.com/escu-io/go-report-builder/covhtml).

```go
package main

import (
	"log"

	"github.com/escu-io/go-report-builder/covhtml"
)

func main() {
	err := covhtml.Generate(covhtml.Options{
		Profiles:   []covhtml.ProfileInput{{Path: "cover.out"}},
		OutputPath: "coverage-report.html",
	})
	if err != nil {
		log.Fatal(err)
	}
}
```

Compare or merge multiple runs:

```go
err := covhtml.Generate(covhtml.Options{
	Profiles: []covhtml.ProfileInput{
		{Path: "unit.out", Label: "unit"},
		{Path: "integration.out", Label: "integration"},
	},
	OutputPath: "coverage-report.html",
})
```

## A note on the headline percentage

By default the tool discovers all module `.go` files and treats files absent from the
profile as 0% covered. This can yield a **lower** headline percentage than `go tool cover`
on the same profile — that difference is intentional. Pass `--profile-only` (CLI) or set
`Options.ProfileOnly` (library) for the profile-exact number. See
[`docs/adr/0003-discover-all-module-files-by-default.md`](docs/adr/0003-discover-all-module-files-by-default.md).

## Development

```bash
make test        # run tests
make lint        # go vet
make lint-ci     # golangci-lint (matches CI)
make build       # build the CLI
make report      # self-test: build a coverage report of this repo
make help        # all targets
```

### Releases

This project uses [Semantic Versioning](https://semver.org/), [Conventional Commits](https://www.conventionalcommits.org/),
[git-cliff](https://git-cliff.org/) for `CHANGELOG.md`, and [GoReleaser](https://goreleaser.com/) for GitHub Releases
and multi-platform CLI binaries.

Maintainers:

```bash
# Refresh the [Unreleased] changelog section
make changelog

# Cut a release (runs tests, updates changelog, tags, pushes — CI publishes binaries)
VERSION=0.2.0 make release
# or: BUMP=patch make release
```

Configure GitHub repo description and topics:

```bash
./scripts/setup-github-repo.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and
[docs/adr/](docs/adr/) for architecture decision records.

## License

Licensed under the [MIT License](LICENSE).
