# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Public `covhtml` library API (`Generate`, `Options`, `ProfileInput`) with
  package and field documentation for pkg.go.dev.
- `go-report-builder` CLI for generating interactive HTML coverage reports.
- Interactive report: zoomable treemap, collapsible tree, syntax-highlighted
  file detail, per-run filter, and dark/light theme toggle.
- Whole-module discovery: untested files are reported as 0% covered by default,
  with a `--profile-only` opt-out.
- MIT license, contribution guide, Makefile, and CI workflow.

[Unreleased]: https://github.com/escu-io/go-report-builder/commits/main
