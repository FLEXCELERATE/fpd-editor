---
'fpd-vscode-extension': minor
---

Reworked diagram layout in the preview.

- **Parallel branches are visible.** Process operators that run in parallel are now laid out side by side. Previously every operator got its own row regardless of the graph, so a step fed by eight others showed those eight stacked vertically and the structure of the process was invisible. On a 20-operator description this turns 20 rows into 12 levels.
- **Labels no longer overlap.** The layout now measures how wide a label actually is instead of reserving the width of the shape, so state names keep clear of one another and of the boxes.
- **Connections route around obstacles.** A flow spanning several steps used to be drawn straight through every box in between. Connections now find a way around, and are also kept off the labels. Arrowheads meet a box square on rather than running down its edge.
- **Flows follow the notation more closely.** Every kind of flow is drawn black and solid; alternative and parallel flows are told apart by their routing, and both branch from a single shared point on the element they have in common. Dashing is reserved for resource assignment.
- **Input materials sit above the step they feed**, on the system limit, with their labels dealt across lanes where they are wider than the spacing between them.
- **Operator names wrap** instead of being shrunk to an unreadable size in a box with unused height.

Also fixes a data-loss bug in FPD text export: with a `system { }` block present, elements declared outside it were written nowhere, so exporting such a description and reading it back lost those elements and every flow referring to them.
