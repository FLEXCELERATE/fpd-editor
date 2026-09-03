---
'@fpd-editor/core': patch
---

Routing: arrows meet boxes square on, and fewer connections cross each other.

- **Arrowheads.** A line ending on a box's left or right edge could arrive vertically, so the arrow ran down the side of the box instead of entering it. The port stub collapsed whenever a grid line coincided with the port: axis values are rounded, so the stub came out zero-length and was dropped as a duplicate, leaving the vertical segment before it as the last one. Stubs now require a real gap, and grid and obstacle coordinates go through the same rounding.
- **Crossings.** The router priced obstacles and overlap but not crossings, and it only knew about the connections it had routed itself — on a real diagram barely half of them, since a plain unobstructed route skips the search. Every accepted route is now recorded on the grid, including the plain ones, and running through a point another connection already passes through at right angles carries a cost. On the reference document crossings drop from 33 to 22.
- **Label clearance.** A label block is an estimate of where the glyphs land, so connections now keep a small margin from it — a line laid flush against the bare estimate still grazed the ascenders of the real text. The margin applies to routing only: two labels may sit right next to each other.
