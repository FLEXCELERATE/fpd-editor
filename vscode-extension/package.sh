#!/bin/bash

# FPB VS Code Extension Packaging Script
# This script automates the process of compiling and packaging the extension

set -e  # Exit on error

echo "==================================="
echo "FPB VS Code Extension Packager"
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
echo "[1/5] Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    echo "✓ Dependencies installed"
else
    echo "✓ Dependencies already installed (use 'npm install' to update)"
fi
echo ""

# Step 2: Clean previous build
echo "[2/5] Cleaning previous build..."
if [ -d "out" ]; then
    rm -rf out
    echo "✓ Removed old build artifacts"
else
    echo "✓ No previous build to clean"
fi
echo ""

# Step 3: Compile TypeScript
echo "[3/5] Compiling TypeScript..."
npm run compile
if [ $? -eq 0 ]; then
    echo "✓ TypeScript compilation successful"
else
    echo "✗ TypeScript compilation failed"
    exit 1
fi
echo ""

# Step 4: Run linting (optional, don't fail on warnings)
echo "[4/5] Running ESLint..."
npm run lint || echo "⚠ Linting warnings found (non-blocking)"
echo ""

# Step 5: Package as VSIX
echo "[5/5] Creating VSIX package..."
npm run package

if [ $? -eq 0 ]; then
    echo ""
    echo "==================================="
    echo "✓ Packaging complete!"
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
    echo "✗ Packaging failed"
    exit 1
fi
