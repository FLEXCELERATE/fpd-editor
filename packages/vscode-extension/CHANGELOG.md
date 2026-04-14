# Changelog

## 0.4.1

### Patch Changes

- [#1](https://github.com/FLEXCELERATE/fpd-editor/pull/1) [`0f10817`](https://github.com/FLEXCELERATE/fpd-editor/commit/0f10817271e540f2f09d5ab7d3606c87c7f8bdbf) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Code quality improvements: extract shared routing/design tokens, add layout tests, decompose layout engine, harden backend security, add pre-commit hooks, coverage reporting, and VSIX build verification in CI.

- Updated dependencies [[`0f10817`](https://github.com/FLEXCELERATE/fpd-editor/commit/0f10817271e540f2f09d5ab7d3606c87c7f8bdbf)]:
    - @fpd-editor/core@0.3.0

All notable changes to the FPD Language Support extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-03-30

### Fixed

- Updated Marketplace README with installation instructions and build docs

## [0.3.0] - 2026-03-30

### Changed

- **Monorepo restructure**: Extension now consumes `@fpd-editor/core` as a workspace dependency instead of bundling core source inline.
- Replaced `innerHTML` SVG injection with `DOMParser` + `appendChild` to prevent XSS
- Nonce-based Content Security Policy replaces `'unsafe-inline'` for scripts
- Error messages sanitized to strip file paths (Windows, Unix, UNC)
- Tooltip uses VS Code CSS variables for dark mode support
- OutputChannel replaces console.log for proper logging

### Added

- 17 unit tests for StateManager (vitest)
- `onCommand:fpd.preview.show` activation event
- Debounce timeout cleanup via Disposable in diagnosticsProvider

### Security

- SVG rendered via DOMParser instead of innerHTML
- CSP: `script-src 'nonce-...'` instead of `'unsafe-inline'`
- Error messages no longer leak internal file paths

### Fixed

- Extension no longer activates on every VS Code startup (proper activation events)
- OutputChannel properly disposed on deactivate

## [0.2.0] - 2026-03-16

### Changed

- **Complete TypeScript rewrite**: Replaced the Python/FastAPI backend with a pure TypeScript core engine running directly in the extension process. No external dependencies or backend server required.
- **Simplified architecture**: All parsing, layout, rendering, and export now happen in-process via direct function calls.
- Renamed language from "FPB" to "FPD" (Formalized Process Description) throughout.

### Added

- TypeScript core engine: lexer, parser, validator, 7-phase layout algorithm, SVG renderer
- SVG export with orthogonal connection routing
- VDI 3682 XML export (HSU FPD_Schema format)
- FPD text export (reformatted source)
- XML import with dual-format detection (Legacy + HSU)
- Multi-system layout support with topological sort
- Hover tooltips showing element type and ID in the preview
- Click-to-source navigation (double-click element in preview to jump to source line)

### Removed

- Python backend dependency (FastAPI, uvicorn, etc.)
- Backend configuration settings (`fpd.backend.url`, `fpd.backend.autoStart`)
- PNG export (requires native dependencies)
- PDF export (temporarily disabled — shapes/layout need correction)

### Fixed

- Extension now works out of the box without any prerequisites beyond VS Code

## [0.1.2] - 2026-03-16

### Fixed

- Update `@typescript-eslint` to v8 and fix ESLint configuration to resolve security vulnerabilities
- Fix issues that prevented the VS Code extension from working correctly on other machines

### Changed

- Clean up unused frontend layout code
- Update backend port to 8741

## [0.1.1] - 2026-03-15

### Added

- Hover tooltips showing element type and ID in the diagram preview
- Click-to-source navigation (double-click element to jump to source line)
- Pointer cursor on interactive diagram elements

### Changed

- Switch web frontend diagram to backend SVG rendering

## [0.1.0] - 2026-02-22

### Initial Release

First public release with syntax highlighting, IntelliSense, diagnostics, live diagram preview, and Python backend integration.

---

[0.3.1]: https://github.com/FLEXCELERATE/fpd-editor/releases/tag/vscode-0.3.1
[0.3.0]: https://github.com/FLEXCELERATE/fpd-editor/releases/tag/vscode-0.3.0
[0.2.0]: https://github.com/FLEXCELERATE/fpd-editor/releases/tag/vscode-0.2.0
[0.1.2]: https://github.com/FLEXCELERATE/fpd-editor/releases/tag/vscode-0.1.2
[0.1.1]: https://github.com/FLEXCELERATE/fpd-editor/releases/tag/vscode-0.1.1
[0.1.0]: https://github.com/FLEXCELERATE/fpd-editor/releases/tag/vscode-0.1.0
