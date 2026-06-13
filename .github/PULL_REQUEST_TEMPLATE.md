## Summary

<!-- What changed and why? Link related issues: Fixes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation / CI / tooling

## Checklist

- [ ] `make fmt lint test` passes locally
- [ ] Tests added or updated for behavior changes
- [ ] Public API changes (`covhtml`) are documented in package comments
- [ ] CHANGELOG / release notes updated if user-facing (or will be via Conventional Commits)

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for changelog and semver releases:

- `feat:` — new feature (minor bump)
- `fix:` — bug fix (patch bump)
- `feat!:` or `BREAKING CHANGE:` — breaking change (major bump)
- `docs:`, `test:`, `chore:`, `ci:` — no release bump (unless release tooling)
