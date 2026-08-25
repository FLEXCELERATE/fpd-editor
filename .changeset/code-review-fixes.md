---
'@fpd-editor/core': patch
'@fpd-editor/backend': patch
'fpd-vscode-extension': patch
'fpd-editor-frontend': patch
---

Fix a batch of correctness, security, and robustness issues found in a deep code review:

- **core (layout):** flows in diagrams without `system` blocks were rendered twice (once as a spurious cross-system arrow). Cross-system is now determined by endpoints being in different systems.
- **core (import):** guard the hand-rolled XML parser against pathologically nested input that could freeze the event loop (denial of service); deeply nested or oversized documents are now rejected up front.
- **core (lexer):** directional placement annotations (`@boundary-top/-bottom/-left/-right`) are now tokenized correctly instead of matching `@boundary` plus stray text.
- **core (render/pdf):** alternative (`-.->`) and parallel (`==>`) flows now render with their own colours and arrow markers instead of looking identical to regular flows.
- **backend:** add a request timeout, honour `TRUST_PROXY` for correct client-IP handling behind a proxy, exempt the health check from rate limiting, support a comma-separated `CORS_ORIGIN` allowlist, and harden graceful shutdown.
- **frontend:** mouse-wheel zoom now activates, undo/redo no longer conflicts with Monaco's internal history, and zoom-to-fit / pan use the correct viewBox coordinate system.
- **vscode-extension:** parse errors and validation warnings are now surfaced in the preview instead of being silently discarded.
