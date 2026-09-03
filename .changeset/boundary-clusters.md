---
'@fpd-editor/core': patch
---

Layout: place boundary states as a compact cluster over the operator they belong to.

Inputs to the first operators were packed in one row across the whole system limit, which put a state up to 311px away from the box it feeds. Two causes: a cluster of four inputs was laid out as a horizontal run wider than its 150px operator, and every cluster was packed in a single pass, so states of unrelated operators pushed each other around — an operator with a single input had it sitting 149px off to the side for no reason.

- Boundary states are grouped by their operator and dealt across as many rows as their labels need, at a tight pitch. No two share an x, so their drop lines never block one another.
- Cluster widths are computed before the operators are placed, so the operator row reserves room for them. The row reserves the shape span; the clusters are packed against each other on their label extents, so labels never collide without inflating the operator spacing.
- Top and bottom edges are packed separately — they can never touch, so they should not compete for horizontal space.

On the reference document the worst offset drops from 311px to 143px, which is the minimum for four shapes at that pitch, and four of the five single-input operators get their input exactly on their centre line.
