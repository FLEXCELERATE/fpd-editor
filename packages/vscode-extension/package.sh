#!/bin/bash

# FPD VS Code Extension Packaging Script
#
# Builds the shared core package, bundles the extension with esbuild, and
# produces a VSIX. Mirrors the "Verify VSIX packaging" step in CI.
#
# Run from the packages/vscode-extension directory.

set -euo pipefail

echo "==================================="
echo "FPD VS Code Extension Packager"
echo "==================================="

if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Run this script from packages/vscode-extension." >&2
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is not installed. This is a pnpm workspace (npm cannot resolve workspace:* deps)." >&2
    exit 1
fi

REPO_ROOT="$(cd ../.. && pwd)"

echo "[1/4] Installing workspace dependencies..."
pnpm install --frozen-lockfile

echo "[2/4] Building the shared core package..."
pnpm --filter @fpd-editor/core build

echo "[3/4] Creating production bundle (esbuild -> dist/extension.js)..."
pnpm run package

echo "[4/4] Creating VSIX package..."
pnpm exec vsce package --no-dependencies --skip-license

VSIX_FILE=$(ls -t ./*.vsix 2>/dev/null | head -1)
echo ""
echo "==================================="
echo "Packaging complete!"
echo "==================================="
if [ -n "$VSIX_FILE" ]; then
    echo "Package: $VSIX_FILE"
    echo ""
    echo "To install:"
    echo "  code --install-extension $VSIX_FILE"
else
    echo "Warning: no VSIX file found in $(pwd)" >&2
fi
