#!/usr/bin/env bash
# Prepare and publish a semver release.
#
# Usage:
#   ./scripts/release.sh 0.2.0          # patch/minor/major explicit version
#   ./scripts/release.sh --bump patch     # auto-bump from latest tag
#   ./scripts/release.sh --bump minor
#   ./scripts/release.sh --bump major
#   ./scripts/release.sh --dry-run 0.2.0  # show steps without tagging
#
# Flow:
#   1. Run tests and linters
#   2. Update CHANGELOG.md (git-cliff)
#   3. Commit changelog, create annotated tag, push
#   4. GitHub Actions (release.yml) runs GoReleaser on the tag
#
# Requires: git-cliff (optional but recommended), clean working tree
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
BUMP=""

usage() {
  cat <<'EOF'
Usage: release.sh [--dry-run] [--bump patch|minor|major] [VERSION]

Examples:
  release.sh 0.2.0
  release.sh --bump patch
  release.sh --dry-run 0.2.0
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --bump)
      BUMP="${2:?--bump requires patch|minor|major}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

latest_tag() {
  git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"
}

bump_version() {
  local current="$1" kind="$2"
  local ver="${current#v}"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$ver"
  case "$kind" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
    *) echo "invalid bump kind: $kind" >&2; exit 1 ;;
  esac
  echo "${major}.${minor}.${patch}"
}

VERSION="${1:-}"
if [[ -n "$BUMP" ]]; then
  VERSION="$(bump_version "$(latest_tag)" "$BUMP")"
elif [[ -z "$VERSION" ]]; then
  echo "VERSION or --bump is required" >&2
  usage
  exit 1
fi

TAG="v${VERSION#v}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first." >&2
  git status --short
  exit 1
fi

echo "==> Preparing release ${TAG}"

echo "==> Running tests"
make test lint

if command -v git-cliff >/dev/null 2>&1; then
  echo "==> Updating CHANGELOG.md"
  if [[ "$DRY_RUN" == true ]]; then
    git-cliff --config .git-cliff.toml --tag "$TAG" --unreleased
  else
    "$ROOT/scripts/changelog.sh" "$TAG"
  fi
else
  echo "==> git-cliff not found; ensure CHANGELOG.md is updated manually"
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run complete. No commit or tag created."
  exit 0
fi

if [[ -n "$(git status --porcelain CHANGELOG.md)" ]]; then
  git add CHANGELOG.md
  git commit -m "chore(release): prepare ${TAG}"
fi

echo "==> Creating tag ${TAG}"
git tag -a "$TAG" -m "Release ${TAG}"

echo "==> Pushing branch and tag"
git push origin HEAD
git push origin "$TAG"

cat <<EOF

Release ${TAG} pushed.

Next steps (automatic):
  - GitHub Actions runs GoReleaser and publishes binaries + GitHub Release
  - Release Drafter may have pre-filled notes; GoReleaser changelog takes precedence

Verify:
  https://github.com/escu-io/go-report-builder/actions
  https://github.com/escu-io/go-report-builder/releases/tag/${TAG}
EOF
