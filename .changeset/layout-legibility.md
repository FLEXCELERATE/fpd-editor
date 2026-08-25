---
'@fpd-editor/core': minor
---

Layout and routing: eliminate overlaps between labels, element bodies and connections.

- **Text metrics** (`textMetrics.ts`): the layout now knows how wide a label actually is, from the Helvetica advance-width table, instead of reserving the shape width. State labels reach up to 190px where the shape is 55px wide, which is why labels in a row overlapped each other.
- **Label geometry**: state labels sit clear of the shape's whole horizontal span, so no port on a top or bottom edge falls under a label. The layout reserves the resulting asymmetric slot exactly.
- **Ordering and coordinates**: operators within a rank are ordered by repeated barycentre sweeps and then placed at the average position of their neighbours, rather than keeping the topological sort's arbitrary order and sitting rigidly on the core centre. Top and bottom boundary states are positioned over the operator they belong to instead of being spread by count.
- **Obstacle-aware routing** (`orthogonalRouter.ts`): connections are routed by shortest-path search over a Hanan grid built from the obstacles, which include the label blocks. Previously the bend was placed at the midpoint between the ports without regard for what was in between, so an edge spanning several ranks was drawn through every box on the way. A congestion cost spreads parallel connections onto neighbouring lanes.
- **Band spacing**: the gap between a row of operators and the intermediate states below it now reserves room for those states' labels, which previously covered the operators' own ports.
- **Box text**: operator and technical-resource labels wrap before the font is reduced, instead of being shrunk to 7px in a box with most of its height unused.

On the reference document all four overlap classes drop to zero (previously 9 label/label, 27 edge/box and 24 edge/label collisions).
