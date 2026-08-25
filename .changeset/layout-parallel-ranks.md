---
'@fpd-editor/core': minor
---

Layout: lay out process operators of one topological wave side by side instead of stacking every operator in a single column, so parallel branches and merges are visible.

- Rank assignment advances once per topological wave rather than once per operator, restoring the level information Kahn's algorithm already computes. The node-wise cycle fallback is unchanged.
- Operators of a rank are distributed horizontally and centered in the core.
- Intermediate states are packed around the midpoint of their own source and target operators, and per band rather than per source/target rank pair — states of different rank pairs that share a band previously overlapped.
- Boundary-left/right states attach to their individual operator instead of to the rank, so several operators in one rank no longer pile their edge states on the same row center.
- Feedback states sharing a rank interval no longer land on the same position.
- Operators with neither a flow nor a usage are kept out of the ranks so the existing "place disconnected elements below the graph" path actually takes effect instead of being discarded as a duplicate.
