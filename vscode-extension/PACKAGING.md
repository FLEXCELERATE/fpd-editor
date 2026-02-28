# Packaging the FPB VS Code Extension

This guide explains how to package the FPB extension as a `.vsix` file for distribution and installation.

## Prerequisites

Before packaging, ensure you have:
- Node.js 18+ installed
- npm or yarn package manager
- VS Code Extension Manager (`vsce`) tool

## Step 1: Install Dependencies

Navigate to the extension directory and install all required dependencies:

```bash
cd vscode-extension
npm install
```

This will install:
- TypeScript compiler and type definitions
- VS Code Extension API types
- ESLint for code quality
- vsce for packaging
- axios for HTTP requests

## Step 2: Compile TypeScript

Compile the TypeScript source code to JavaScript:

```bash
npm run compile
```

This will:
- Run the TypeScript compiler (`tsc`)
- Generate JavaScript files in the `out/` directory
- Create source maps for debugging

Alternatively, use watch mode during development:

```bash
npm run watch
```

## Step 3: Lint and Test (Optional)

Run linting to ensure code quality:

```bash
npm run lint
```

Run tests (if available):

```bash
npm test
```

## Step 4: Package as VSIX

Create the `.vsix` package file:

```bash
npm run package
```

Or directly use vsce:

```bash
npx vsce package
```

This will generate a file named `fpb-vscode-extension-0.1.0.vsix` in the current directory.

### Packaging Options

- **Specific version**: `npx vsce package 0.2.0`
- **Pre-release**: `npx vsce package --pre-release`
- **Output directory**: `npx vsce package -o ./dist/`

## Step 5: Verify the Package

List the contents of the generated VSIX:

```bash
npx vsce ls
```

Check the package file exists:

```bash
ls -la *.vsix
```

Expected output:
```
fpb-vscode-extension-0.1.0.vsix
```

## Installation

### Local Installation

Install the packaged extension in VS Code:

```bash
code --install-extension fpb-vscode-extension-0.1.0.vsix
```

Or manually:
1. Open VS Code
2. Press `Ctrl+Shift+P` (Cmd+Shift+P on macOS)
3. Select "Extensions: Install from VSIX..."
4. Choose the `fpb-vscode-extension-0.1.0.vsix` file

### Publishing to Marketplace

To publish to the VS Code Marketplace:

1. Create a publisher account at https://marketplace.visualstudio.com/
2. Get a Personal Access Token (PAT) from Azure DevOps
3. Login with vsce:
   ```bash
   npx vsce login <publisher-name>
   ```
4. Publish:
   ```bash
   npx vsce publish
   ```

## Files Included in Package

The `.vsix` package includes:
- Compiled JavaScript (`out/`)
- TextMate grammar (`syntaxes/`)
- Language configuration
- Webview assets (`media/`)
- Extension icon and images
- README and CHANGELOG
- package.json manifest

Files excluded (see `.vscodeignore`):
- TypeScript source files (`src/`)
- Test files
- Node modules (bundled by vsce)
- Build configuration files

## Troubleshooting

### Missing Dependencies

If you see errors about missing modules:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Compilation Errors

If TypeScript compilation fails:
```bash
npm run compile 2>&1 | tee compile.log
```

Check `compile.log` for specific errors.

### VSIX Creation Fails

Common issues:
- Missing required fields in `package.json`
- Invalid icon path
- Missing README or CHANGELOG
- Files too large (>50MB limit)

Run validation:
```bash
npx vsce ls --verbose
```

## Version Management

Update version in `package.json` before packaging:

```json
{
  "version": "0.2.0"
}
```

Or use npm version commands:
```bash
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.0 -> 0.2.0
npm version major  # 0.1.0 -> 1.0.0
```

## Additional Resources

- [VS Code Extension Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)
- [Extension Manifest Reference](https://code.visualstudio.com/api/references/extension-manifest)
