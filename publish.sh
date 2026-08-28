#!/usr/bin/env bash

# Bump the package version on a timestamped release branch, validate the
# publish tarball, then push to trigger .github/workflows/publish-npm.yml.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BUMP="${1:-patch}"

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [patch|minor|major]" >&2
  exit 1
fi

case "$BUMP" in
  patch|minor|major) ;;
  *)
    echo "Usage: $0 [patch|minor|major]" >&2
    exit 1
    ;;
esac

SOURCE_BRANCH="$(git branch --show-current)"
if [[ "$SOURCE_BRANCH" != "main" ]]; then
  echo "Refusing to publish from '$SOURCE_BRANCH'. Switch to main first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before publishing." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it with: corepack enable && corepack prepare pnpm@11 --activate" >&2
  exit 1
fi

VERSION="$(pnpm version "$BUMP" --dry-run --json | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => { console.log(JSON.parse(input)[0].newVersion); });
')"
RELEASE_BRANCH="release/${VERSION}-$(date +%Y%m%d%H%M%S)"

git switch -c "$RELEASE_BRANCH"
pnpm version "$BUMP" --no-git-tag-version

pnpm install --frozen-lockfile
pnpm run build
npm pack --dry-run --ignore-scripts

git add package.json src/version.ts
git commit -m "chore(release): v$VERSION"
git push origin "HEAD:$RELEASE_BRANCH"

echo "Pushed cam-fe-code-generator@$VERSION to $RELEASE_BRANCH. GitHub Actions will publish it to npm."
