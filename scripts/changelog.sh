#!/usr/bin/env bash
# Regenerate CHANGELOG.md from git history using git-cliff.
#
# Usage:
#   ./scripts/changelog.sh              # update [Unreleased] section only
#   ./scripts/changelog.sh --unreleased # same as above
#   ./scripts/changelog.sh v0.2.0       # cut a release section for v0.2.0
#
# Requires: git-cliff (https://git-cliff.org)
#   brew install git-cliff
#   cargo install git-cliff
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v git-cliff >/dev/null 2>&1; then
  echo "git-cliff is required. Install: https://git-cliff.org/docs/installation/" >&2
  exit 1
fi

VERSION="${1:---unreleased}"

if [[ "$VERSION" == "--unreleased" ]]; then
  git-cliff --config .git-cliff.toml --unreleased --prepend CHANGELOG.md
  echo "Updated [Unreleased] section in CHANGELOG.md"
else
  # Accept v0.2.0 or 0.2.0
  TAG="$VERSION"
  if [[ "$TAG" != v* ]]; then
    TAG="v${TAG}"
  fi
  git-cliff --config .git-cliff.toml --tag "$TAG" --prepend CHANGELOG.md
  echo "Prepended ${TAG} section to CHANGELOG.md"
fi
