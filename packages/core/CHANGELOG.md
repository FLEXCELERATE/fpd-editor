# @fpd-editor/core

## 0.4.0

### Minor Changes

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`c82d063`](https://github.com/FLEXCELERATE/fpd-editor/commit/c82d06334cf7bde5f4a1363ca2e11b2614aab828) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Flows: draw every kind in black and solid, and tell them apart by their routing.

    Alternative flows were orange and dashed, parallel flows blue and dashed, cross-system violet and dashed. Per VDI 3682 practice the drawing is black: dashing marks resource assignment only, and the kinds of flow are distinguished by how they run.
    - All flow types render black and solid. `usage` keeps its dashed stroke, as does the system limit.
    - An alternative flow runs straight, a parallel flow is angled, a plain flow is angled too.
    - Alternative and parallel flows now branch from — or merge into — a **single shared port** on the element they have in common, where a plain flow keeps its own. Members of a bundle first agree on which side of that element the point sits on, from the bundle's average direction: deciding per flow put two parallel inflows on 'top' and 'right' of the same operator, so they could never share a point.

    Boundary states additionally all sit on the system limit edge again. Where a cluster's labels are wider than the pitch between its states, the labels are dealt across lanes stacked above the shapes (new `LayoutElement.labelRow`) rather than the states stepping outwards off the edge.

- [#3](https://github.com/FLEXCELERATE/fpd-editor/pull/3) [`63d32b1`](https://github.com/FLEXCELERATE/fpd-editor/commit/63d32b1741f27e313261de131c7753583192b78f) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Architecture: the web app now runs entirely in the browser, plus a batch of robustness fixes and new features.
    - **frontend (architecture):** parsing, rendering, import, and export use `@fpd-editor/core` directly in the browser — no backend round-trips, near-instant preview (debounce 500ms → 150ms), documents never leave the machine. The Fastify backend remains available as an optional standalone REST API. Monaco is now served from the bundle instead of a third-party CDN (works offline / air-gapped).
    - **frontend (features):** documents are auto-saved to localStorage and restored on reload; a Share button copies a URL with the (compressed) document in the fragment; validation warnings are shown in a warning panel; placing the editor cursor on an element highlights it in the diagram.
    - **frontend (a11y):** Ctrl/Cmd+±/0 no longer hijack browser page zoom globally — diagram zoom applies only while the diagram pane is focused.
    - **core:** technical-resource-only systems now render; nested `system` blocks are diagnosed and no longer corrupt scoping; XML entity decoding is single-pass (no `&amp;` double-decode) with numeric character references; unterminated strings are reported as parse errors; PDF export no longer crashes on non-Latin characters (they are replaced with `?`).
    - **backend:** security response headers via `@fastify/helmet`.
    - **tooling:** Playwright e2e suite (13 tests) now runs in CI; vitest unified on v4 across all packages; stale npm lockfiles removed from the pnpm workspace.

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`2dcbff0`](https://github.com/FLEXCELERATE/fpd-editor/commit/2dcbff0767a0a1cd1c049e3fc992148755ad445c) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Layout and routing: eliminate overlaps between labels, element bodies and connections.
    - **Text metrics** (`textMetrics.ts`): the layout now knows how wide a label actually is, from the Helvetica advance-width table, instead of reserving the shape width. State labels reach up to 190px where the shape is 55px wide, which is why labels in a row overlapped each other.
    - **Label geometry**: state labels sit clear of the shape's whole horizontal span, so no port on a top or bottom edge falls under a label. The layout reserves the resulting asymmetric slot exactly.
    - **Ordering and coordinates**: operators within a rank are ordered by repeated barycentre sweeps and then placed at the average position of their neighbours, rather than keeping the topological sort's arbitrary order and sitting rigidly on the core centre. Top and bottom boundary states are positioned over the operator they belong to instead of being spread by count.
    - **Obstacle-aware routing** (`orthogonalRouter.ts`): connections are routed by shortest-path search over a Hanan grid built from the obstacles, which include the label blocks. Previously the bend was placed at the midpoint between the ports without regard for what was in between, so an edge spanning several ranks was drawn through every box on the way. A congestion cost spreads parallel connections onto neighbouring lanes.
    - **Band spacing**: the gap between a row of operators and the intermediate states below it now reserves room for those states' labels, which previously covered the operators' own ports.
    - **Box text**: operator and technical-resource labels wrap before the font is reduced, instead of being shrunk to 7px in a box with most of its height unused.

    On the reference document all four overlap classes drop to zero (previously 9 label/label, 27 edge/box and 24 edge/label collisions).

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`a8e7105`](https://github.com/FLEXCELERATE/fpd-editor/commit/a8e710501e7dd96e197a2bc9a5cba3c6a1cac916) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Layout: lay out process operators of one topological wave side by side instead of stacking every operator in a single column, so parallel branches and merges are visible.
    - Rank assignment advances once per topological wave rather than once per operator, restoring the level information Kahn's algorithm already computes. The node-wise cycle fallback is unchanged.
    - Operators of a rank are distributed horizontally and centered in the core.
    - Intermediate states are packed around the midpoint of their own source and target operators, and per band rather than per source/target rank pair — states of different rank pairs that share a band previously overlapped.
    - Boundary-left/right states attach to their individual operator instead of to the rank, so several operators in one rank no longer pile their edge states on the same row center.
    - Feedback states sharing a rank interval no longer land on the same position.
    - Operators with neither a flow nor a usage are kept out of the ranks so the existing "place disconnected elements below the graph" path actually takes effect instead of being discarded as a duplicate.

### Patch Changes

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`c4e9bd3`](https://github.com/FLEXCELERATE/fpd-editor/commit/c4e9bd32165a4d152a0eaae1163c6bf70989bc91) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Layout: place boundary states as a compact cluster over the operator they belong to.

    Inputs to the first operators were packed in one row across the whole system limit, which put a state up to 311px away from the box it feeds. Two causes: a cluster of four inputs was laid out as a horizontal run wider than its 150px operator, and every cluster was packed in a single pass, so states of unrelated operators pushed each other around — an operator with a single input had it sitting 149px off to the side for no reason.
    - Boundary states are grouped by their operator and dealt across as many rows as their labels need, at a tight pitch. No two share an x, so their drop lines never block one another.
    - Cluster widths are computed before the operators are placed, so the operator row reserves room for them. The row reserves the shape span; the clusters are packed against each other on their label extents, so labels never collide without inflating the operator spacing.
    - Top and bottom edges are packed separately — they can never touch, so they should not compete for horizontal space.

    On the reference document the worst offset drops from 311px to 143px, which is the minimum for four shapes at that pitch, and four of the five single-input operators get their input exactly on their centre line.

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

- [#7](https://github.com/FLEXCELERATE/fpd-editor/pull/7) [`4d94f0b`](https://github.com/FLEXCELERATE/fpd-editor/commit/4d94f0b3c5169c62c932fd41d548f36af1f65e1b) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Routing: arrows meet boxes square on, and fewer connections cross each other.
    - **Arrowheads.** A line ending on a box's left or right edge could arrive vertically, so the arrow ran down the side of the box instead of entering it. The port stub collapsed whenever a grid line coincided with the port: axis values are rounded, so the stub came out zero-length and was dropped as a duplicate, leaving the vertical segment before it as the last one. Stubs now require a real gap, and grid and obstacle coordinates go through the same rounding.
    - **Crossings.** The router priced obstacles and overlap but not crossings, and it only knew about the connections it had routed itself — on a real diagram barely half of them, since a plain unobstructed route skips the search. Every accepted route is now recorded on the grid, including the plain ones, and running through a point another connection already passes through at right angles carries a cost. On the reference document crossings drop from 33 to 22.
    - **Label clearance.** A label block is an estimate of where the glyphs land, so connections now keep a small margin from it — a line laid flush against the bare estimate still grazed the ascenders of the real text. The margin applies to routing only: two labels may sit right next to each other.

## 0.3.0

### Minor Changes

- [#1](https://github.com/FLEXCELERATE/fpd-editor/pull/1) [`0f10817`](https://github.com/FLEXCELERATE/fpd-editor/commit/0f10817271e540f2f09d5ab7d3606c87c7f8bdbf) Thanks [@anselm-klose](https://github.com/anselm-klose)! - Code quality improvements: extract shared routing/design tokens, add layout tests, decompose layout engine, harden backend security, add pre-commit hooks, coverage reporting, and VSIX build verification in CI.
