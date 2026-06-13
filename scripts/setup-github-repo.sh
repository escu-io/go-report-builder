#!/usr/bin/env bash
# Configure GitHub repository metadata for discoverability.
#
# Usage:
#   ./scripts/setup-github-repo.sh
#   ./scripts/setup-github-repo.sh escu-io/go-report-builder
#
# Requires: GitHub CLI (gh) authenticated with repo admin access.
set -euo pipefail

REPO="${1:-escu-io/go-report-builder}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required: https://cli.github.com/" >&2
  exit 1
fi

DESCRIPTION="Generate rich, self-contained HTML coverage reports from Go cover profiles — CLI and library."

TOPICS=(
  go
  golang
  coverage
  code-coverage
  testing
  cli
  html-report
  devtools
  ci-cd
  golangci-lint
  goreleaser
)

echo "==> Updating repository metadata for ${REPO}"

gh repo edit "$REPO" \
  --description "$DESCRIPTION" \
  --homepage "https://pkg.go.dev/github.com/${REPO}" \
  --enable-issues=true \
  --enable-discussions=true \
  --enable-wiki=false

for topic in "${TOPICS[@]}"; do
  gh repo edit "$REPO" --add-topic "$topic"
done

echo "==> Repository metadata updated"
gh repo view "$REPO" --json description,homepageUrl,repositoryTopics \
  --template '{{.description}}{{"\n"}}{{.homepageUrl}}{{"\n"}}{{range .repositoryTopics}}{{.}} {{end}}{{"\n"}}'

cat <<'EOF'

Suggested next steps:
  1. Enable branch protection on main (require CI + lint checks)
  2. Pin the latest release in GitHub Releases
  3. Add a "Used by" / showcase section to README as adopters appear
EOF
