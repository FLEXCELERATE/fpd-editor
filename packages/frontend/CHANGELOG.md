# fpd-editor-frontend

## 0.2.0

### Minor Changes

- [#3](https://github.com/FLEXCELERATE/fpd-editor/pull/3) [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Architecture: the web app now runs entirely in the browser, plus a batch of robustness fixes and new features.
    - **frontend (architecture):** parsing, rendering, import, and export use `@fpd-editor/core` directly in the browser — no backend round-trips, near-instant preview (debounce 500ms → 150ms), documents never leave the machine. The Fastify backend remains available as an optional standalone REST API. Monaco is now served from the bundle instead of a third-party CDN (works offline / air-gapped).
    - **frontend (features):** documents are auto-saved to localStorage and restored on reload; a Share button copies a URL with the (compressed) document in the fragment; validation warnings are shown in a warning panel; placing the editor cursor on an element highlights it in the diagram.
    - **frontend (a11y):** Ctrl/Cmd+±/0 no longer hijack browser page zoom globally — diagram zoom applies only while the diagram pane is focused.
    - **core:** technical-resource-only systems now render; nested `system` blocks are diagnosed and no longer corrupt scoping; XML entity decoding is single-pass (no `&amp;` double-decode) with numeric character references; unterminated strings are reported as parse errors; PDF export no longer crashes on non-Latin characters (they are replaced with `?`).
    - **backend:** security response headers via `@fastify/helmet`.
    - **tooling:** Playwright e2e suite (13 tests) now runs in CI; vitest unified on v4 across all packages; stale npm lockfiles removed from the pnpm workspace.

### Patch Changes

- [#3](https://github.com/FLEXCELERATE/fpd-editor/pull/3) [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Fix a batch of correctness, security, and robustness issues found in a deep code review:
    - **core (layout):** flows in diagrams without `system` blocks were rendered twice (once as a spurious cross-system arrow). Cross-system is now determined by endpoints being in different systems.
    - **core (import):** guard the hand-rolled XML parser against pathologically nested input that could freeze the event loop (denial of service); deeply nested or oversized documents are now rejected up front.
    - **core (lexer):** directional placement annotations (`@boundary-top/-bottom/-left/-right`) are now tokenized correctly instead of matching `@boundary` plus stray text.
    - **core (render/pdf):** alternative (`-.->`) and parallel (`==>`) flows now render with their own colours and arrow markers instead of looking identical to regular flows.
    - **backend:** add a request timeout, honour `TRUST_PROXY` for correct client-IP handling behind a proxy, exempt the health check from rate limiting, support a comma-separated `CORS_ORIGIN` allowlist, and harden graceful shutdown.
    - **frontend:** mouse-wheel zoom now activates, undo/redo no longer conflicts with Monaco's internal history, and zoom-to-fit / pan use the correct viewBox coordinate system.
    - **vscode-extension:** parse errors and validation warnings are now surfaced in the preview instead of being silently discarded.

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`ec60b12`](https://github.com/FLEXCELERATE/fpd-editor/commit/ec60b1291f41bbc86a395e1e5bbc7c8b0cbcaca6) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Fix panning, remove the Share button, and stop the text export losing elements.
    - **Text export data loss.** With a `system { }` block present, `exportText` only wrote elements whose `systemId` matched a system — plus cross-system _flows_. States, operators, resources and usages belonging to no system were dropped, and re-reading the file then dropped the flows referencing them too. A document in that shape was destroyed by saving it. Elements outside any system are now written at the top level.
    - **Panning.** The renderer's opaque background rect covered the whole diagram and swallowed every `mousedown`, and the frontend only started a pan when the event target was the bare SVG. Together they left 28% of the canvas pannable. The background rect is now `pointer-events="none"` (it is decoration and exists so a standalone SVG file is opaque), and panning starts anywhere on the canvas.
    - **Share button removed.** It copied a `#fpd=` link built from `window.location`, which is useless from a dev server. Links of that shape still open; only the button and `buildShareUrl` are gone.

- Updated dependencies [[`c4e9bd3`](https://github.com/FLEXCELERATE/fpd-editor/commit/c4e9bd32165a4d152a0eaae1163c6bf70989bc91), [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f), [`c82d063`](https://github.com/FLEXCELERATE/fpd-editor/commit/c82d06334cf7bde5f4a1363ca2e11b2614aab828), [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f), [`2dcbff0`](https://github.com/FLEXCELERATE/fpd-editor/commit/2dcbff0767a0a1cd1c049e3fc992148755ad445c), [`a8e7105`](https://github.com/FLEXCELERATE/fpd-editor/commit/a8e710501e7dd96e197a2bc9a5cba3c6a1cac916), [`ec60b12`](https://github.com/FLEXCELERATE/fpd-editor/commit/ec60b1291f41bbc86a395e1e5bbc7c8b0cbcaca6), [`4d94f0b`](https://github.com/FLEXCELERATE/fpd-editor/commit/4d94f0b3c5169c62c932fd41d548f36af1f65e1b)]:
    - @fpd-editor/core@0.4.0
