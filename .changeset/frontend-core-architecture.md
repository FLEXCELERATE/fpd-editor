---
'@fpd-editor/core': minor
'@fpd-editor/backend': patch
'fpd-editor-frontend': minor
'fpd-vscode-extension': patch
---

Architecture: the web app now runs entirely in the browser, plus a batch of robustness fixes and new features.

- **frontend (architecture):** parsing, rendering, import, and export use `@fpd-editor/core` directly in the browser — no backend round-trips, near-instant preview (debounce 500ms → 150ms), documents never leave the machine. The Fastify backend remains available as an optional standalone REST API. Monaco is now served from the bundle instead of a third-party CDN (works offline / air-gapped).
- **frontend (features):** documents are auto-saved to localStorage and restored on reload; a Share button copies a URL with the (compressed) document in the fragment; validation warnings are shown in a warning panel; placing the editor cursor on an element highlights it in the diagram.
- **frontend (a11y):** Ctrl/Cmd+±/0 no longer hijack browser page zoom globally — diagram zoom applies only while the diagram pane is focused.
- **core:** technical-resource-only systems now render; nested `system` blocks are diagnosed and no longer corrupt scoping; XML entity decoding is single-pass (no `&amp;` double-decode) with numeric character references; unterminated strings are reported as parse errors; PDF export no longer crashes on non-Latin characters (they are replaced with `?`).
- **backend:** security response headers via `@fastify/helmet`.
- **tooling:** Playwright e2e suite (13 tests) now runs in CI; vitest unified on v4 across all packages; stale npm lockfiles removed from the pnpm workspace.
