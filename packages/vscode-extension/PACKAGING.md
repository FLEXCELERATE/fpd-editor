# Packaging & Publishing the FPD VS Code Extension

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+
- VS Code Extension Manager (`vsce`), included as devDependency

## Build

The extension uses esbuild to bundle all source code (including `@fpd-editor/core`) into a single `dist/extension.js` file.

```bash
# From the repository root:

# 1. Install all dependencies
pnpm install

# 2. Build the core package (extension dependency)
pnpm turbo build --filter=@fpd-editor/core

# 3. Package the extension as .vsix
cd packages/vscode-extension
npx vsce package --no-dependencies
```

This generates `fpd-vscode-extension-<version>.vsix`.

> **Why `--no-dependencies`?** The extension lives in a pnpm monorepo. `vsce` uses `npm` internally to check dependencies, which fails with pnpm workspace references. The `--no-dependencies` flag skips this check. All runtime code is bundled by esbuild, so no npm-installed dependencies are needed at runtime.

## Install Locally

```bash
code --install-extension fpd-vscode-extension-<version>.vsix
```

Or in VS Code: `Ctrl+Shift+P` > "Extensions: Install from VSIX..."

## Publish to VS Code Marketplace

### One-time Setup

1. Create a Personal Access Token (PAT) at https://dev.azure.com:
   - **Organization**: "All accessible organizations"
   - **Scopes**: Show all scopes > **Marketplace** > **Manage**
2. Login:
   ```bash
   npx vsce login FLEXCELERATE
   ```

### Publish

```bash
# Bumps version, builds, and publishes in one step:
npx vsce publish --no-dependencies

# Or publish a specific version:
npx vsce publish 0.3.1 --no-dependencies
```

`vsce publish` automatically runs the `vscode:prepublish` script, which triggers `esbuild --minify`.

## Version Management

Update version in `package.json` and `CHANGELOG.md` before publishing:

```bash
# Patch: 0.3.0 -> 0.3.1
npx vsce publish patch --no-dependencies

# Minor: 0.3.0 -> 0.4.0
npx vsce publish minor --no-dependencies

# Major: 0.3.0 -> 1.0.0
npx vsce publish major --no-dependencies
```

## Files in the Package

Included (see `.vscodeignore` for exclusions):

| File | Purpose |
|------|---------|
| `dist/extension.js` | Bundled extension code (esbuild, minified) |
| `syntaxes/fpd.tmLanguage.json` | TextMate grammar for syntax highlighting |
| `language-configuration.json` | Language settings (comments, brackets, etc.) |
| `media/preview.css` | Webview preview stylesheet |
| `images/` | Extension icon and file icon |
| `README.md` | Marketplace listing |
| `CHANGELOG.md` | Version history |
| `LICENSE.txt` | MIT License |
| `package.json` | Extension manifest |

## Troubleshooting

### `npm error missing: ...` during packaging

This is expected in a pnpm monorepo. Use `--no-dependencies` flag.

### 401 error when publishing

Your PAT is invalid or missing the **Marketplace Manage** scope. Regenerate it with **Organization: All accessible organizations** and scope **Marketplace > Manage**.

### Build fails: Cannot find `@fpd-editor/core`

Run `pnpm turbo build --filter=@fpd-editor/core` first to compile the core package.
