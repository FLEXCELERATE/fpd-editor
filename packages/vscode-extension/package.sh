#!/bin/bash

# FPD VS Code Extension Packaging Script
# This script automates the process of bundling the backend,
# compiling TypeScript, and packaging the extension as a VSIX.

set -e  # Exit on error

echo "==================================="
echo "FPD VS Code Extension Packager"
echo "==================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the vscode-extension directory."
    exit 1
fi

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "Node.js version: $(node --version)"
echo ""

# Step 1: Install dependencies
echo "[1/7] Installing npm dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    echo "  Done"
else
    echo "  Dependencies already installed (use 'npm install' to update)"
fi
echo ""

# Step 2: Bundle the Python backend and dependencies
echo "[2/7] Bundling Python backend..."
if [ -f "bundle-backend.sh" ]; then
    bash bundle-backend.sh
    echo "  Done"
else
    echo "  Warning: bundle-backend.sh not found, skipping backend bundling"
    echo "  The VSIX will not include the backend (development mode only)"
fi
echo ""

# Step 3: Clean previous build
echo "[3/7] Cleaning previous build..."
if [ -d "out" ]; then
    rm -rf out
    echo "  Removed old build artifacts"
else
    echo "  No previous build to clean"
fi
echo ""

# Step 4: Compile TypeScript
echo "[4/7] Compiling TypeScript..."
npm run compile
if [ $? -eq 0 ]; then
    echo "  TypeScript compilation successful"
else
    echo "  TypeScript compilation failed"
    exit 1
fi
echo ""

# Step 5: Run linting (optional, don't fail on warnings)
echo "[5/7] Running ESLint..."
npm run lint || echo "  Linting warnings found (non-blocking)"
echo ""

# Step 6: Bundle with esbuild
echo "[6/7] Creating production bundle..."
npm run package
echo ""

# Step 7: Package as VSIX
echo "[7/7] Creating VSIX package..."
npx vsce package --no-dependencies
if [ $? -eq 0 ]; then
    echo ""
    echo "==================================="
    echo "Packaging complete!"
    echo "==================================="
    echo ""

    # List the generated VSIX file
    VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
    if [ -n "$VSIX_FILE" ]; then
        FILE_SIZE=$(ls -lh "$VSIX_FILE" | awk '{print $5}')
        echo "Package: $VSIX_FILE"
        echo "Size: $FILE_SIZE"
        echo ""
        echo "To install:"
        echo "  code --install-extension $VSIX_FILE"
        echo ""
        echo "Or use VS Code UI:"
        echo "  1. Press Ctrl+Shift+P (Cmd+Shift+P on macOS)"
        echo "  2. Select 'Extensions: Install from VSIX...'"
        echo "  3. Choose $VSIX_FILE"
    else
        echo "Warning: VSIX file not found"
    fi
else
    echo ""
    echo "Packaging failed"
    exit 1
fi
