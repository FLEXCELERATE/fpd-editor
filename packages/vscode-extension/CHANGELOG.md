# Changelog

## 0.5.0

### Minor Changes

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`01bb497`](https://github.com/FLEXCELERATE/fpd-editor/commit/01bb497569d46fb672031b7be252eabd6b9c0e99) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Reworked diagram layout in the preview.
    - **Parallel branches are visible.** Process operators that run in parallel are now laid out side by side. Previously every operator got its own row regardless of the graph, so a step fed by eight others showed those eight stacked vertically and the structure of the process was invisible. On a 20-operator description this turns 20 rows into 12 levels.
    - **Labels no longer overlap.** The layout now measures how wide a label actually is instead of reserving the width of the shape, so state names keep clear of one another and of the boxes.
    - **Connections route around obstacles.** A flow spanning several steps used to be drawn straight through every box in between. Connections now find a way around, and are also kept off the labels. Arrowheads meet a box square on rather than running down its edge.
    - **Flows follow the notation more closely.** Every kind of flow is drawn black and solid; alternative and parallel flows are told apart by their routing, and both branch from a single shared point on the element they have in common. Dashing is reserved for resource assignment.
    - **Input materials sit above the step they feed**, on the system limit, with their labels dealt across lanes where they are wider than the spacing between them.
    - **Operator names wrap** instead of being shrunk to an unreadable size in a box with unused height.

    Also fixes a data-loss bug in FPD text export: with a `system { }` block present, elements declared outside it were written nowhere, so exporting such a description and reading it back lost those elements and every flow referring to them.

### Patch Changes

- [#3](https://github.com/FLEXCELERATE/fpd-editor/pull/3) [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Fix a batch of correctness, security, and robustness issues found in a deep code review:
    - **core (layout):** flows in diagrams without `system` blocks were rendered twice (once as a spurious cross-system arrow). Cross-system is now determined by endpoints being in different systems.
    - **core (import):** guard the hand-rolled XML parser against pathologically nested input that could freeze the event loop (denial of service); deeply nested or oversized documents are now rejected up front.
    - **core (lexer):** directional placement annotations (`@boundary-top/-bottom/-left/-right`) are now tokenized correctly instead of matching `@boundary` plus stray text.
    - **core (render/pdf):** alternative (`-.->`) and parallel (`==>`) flows now render with their own colours and arrow markers instead of looking identical to regular flows.
    - **backend:** add a request timeout, honour `TRUST_PROXY` for correct client-IP handling behind a proxy, exempt the health check from rate limiting, support a comma-separated `CORS_ORIGIN` allowlist, and harden graceful shutdown.
    - **frontend:** mouse-wheel zoom now activates, undo/redo no longer conflicts with Monaco's internal history, and zoom-to-fit / pan use the correct viewBox coordinate system.
    - **vscode-extension:** parse errors and validation warnings are now surfaced in the preview instead of being silently discarded.

- [#3](https://github.com/FLEXCELERATE/fpd-editor/pull/3) [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Architecture: the web app now runs entirely in the browser, plus a batch of robustness fixes and new features.
    - **frontend (architecture):** parsing, rendering, import, and export use `@fpd-editor/core` directly in the browser — no backend round-trips, near-instant preview (debounce 500ms → 150ms), documents never leave the machine. The Fastify backend remains available as an optional standalone REST API. Monaco is now served from the bundle instead of a third-party CDN (works offline / air-gapped).
    - **frontend (features):** documents are auto-saved to localStorage and restored on reload; a Share button copies a URL with the (compressed) document in the fragment; validation warnings are shown in a warning panel; placing the editor cursor on an element highlights it in the diagram.
    - **frontend (a11y):** Ctrl/Cmd+±/0 no longer hijack browser page zoom globally — diagram zoom applies only while the diagram pane is focused.
    - **core:** technical-resource-only systems now render; nested `system` blocks are diagnosed and no longer corrupt scoping; XML entity decoding is single-pass (no `&amp;` double-decode) with numeric character references; unterminated strings are reported as parse errors; PDF export no longer crashes on non-Latin characters (they are replaced with `?`).
    - **backend:** security response headers via `@fastify/helmet`.
    - **tooling:** Playwright e2e suite (13 tests) now runs in CI; vitest unified on v4 across all packages; stale npm lockfiles removed from the pnpm workspace.

- Updated dependencies [[`c4e9bd3`](https://github.com/FLEXCELERATE/fpd-editor/commit/c4e9bd32165a4d152a0eaae1163c6bf70989bc91), [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f), [`c82d063`](https://github.com/FLEXCELERATE/fpd-editor/commit/c82d06334cf7bde5f4a1363ca2e11b2614aab828), [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f), [`2dcbff0`](https://github.com/FLEXCELERATE/fpd-editor/commit/2dcbff0767a0a1cd1c049e3fc992148755ad445c), [`a8e7105`](https://github.com/FLEXCELERATE/fpd-editor/commit/a8e710501e7dd96e197a2bc9a5cba3c6a1cac916), [`ec60b12`](https://github.com/FLEXCELERATE/fpd-editor/commit/ec60b1291f41bbc86a395e1e5bbc7c8b0cbcaca6), [`4d94f0b`](https://github.com/FLEXCELERATE/fpd-editor/commit/4d94f0b3c5169c62c932fd41d548f36af1f65e1b)]:
    - @fpd-editor/core@0.4.0

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
