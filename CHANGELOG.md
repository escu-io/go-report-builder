# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions: release (GoReleaser), lint (golangci-lint), CodeQL, Release Drafter, and CI coverage report artifacts.
- Semantic release tooling: `scripts/release.sh`, `scripts/changelog.sh` (git-cliff), and `.goreleaser.yaml`.
- Repository adoption assets: issue/PR templates, Dependabot, `SECURITY.md`, CI integration example, and `scripts/setup-github-repo.sh`.
- CLI `-version` flag (set via GoReleaser ldflags on release builds).

### Fixed

- CI lint: upgrade to golangci-lint v2.4.0 (Go 1.25-compatible) and migrate config to v2 format.

## [0.1.2] - 2026-06-13

### Changed

- Treemap tile distribution improvements.

## [0.1.1] - 2026-06-13

### Fixed

- Treemap view layout: corrected tile sizing and positioning so the zoomable
  treemap renders correctly.

## [0.1.0] - 2026-06-13

### Added

- Public `covhtml` library API (`Generate`, `Options`, `ProfileInput`) with
  package and field documentation for pkg.go.dev.
- `go-report-builder` CLI for generating interactive HTML coverage reports.
- Interactive report: zoomable treemap, collapsible tree, syntax-highlighted
  file detail, per-run filter, and dark/light theme toggle.
- Whole-module discovery: untested files are reported as 0% covered by default,
  with a `--profile-only` opt-out.
- Optional `.go-coverage-report.yaml` config file (`-config` flag) mirroring every
  CLI option; `profiles` accept a bare path string or a `{path, label}` mapping.
- `-tags` flag to pass build tags honored during discovery (config: `buildTags`).
- MIT license, contribution guide, Makefile, and CI workflow.

[Unreleased]: https://github.com/escu-io/go-report-builder/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/escu-io/go-report-builder/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/escu-io/go-report-builder/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/escu-io/go-report-builder/releases/tag/v0.1.0
