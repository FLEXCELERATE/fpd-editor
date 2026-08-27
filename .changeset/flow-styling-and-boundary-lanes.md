---
'@fpd-editor/core': minor
---

Flows: draw every kind in black and solid, and tell them apart by their routing.

Alternative flows were orange and dashed, parallel flows blue and dashed, cross-system violet and dashed. Per VDI 3682 practice the drawing is black: dashing marks resource assignment only, and the kinds of flow are distinguished by how they run.

- All flow types render black and solid. `usage` keeps its dashed stroke, as does the system limit.
- An alternative flow runs straight, a parallel flow is angled, a plain flow is angled too.
- Alternative and parallel flows now branch from — or merge into — a **single shared port** on the element they have in common, where a plain flow keeps its own. Members of a bundle first agree on which side of that element the point sits on, from the bundle's average direction: deciding per flow put two parallel inflows on 'top' and 'right' of the same operator, so they could never share a point.

Boundary states additionally all sit on the system limit edge again. Where a cluster's labels are wider than the pitch between its states, the labels are dealt across lanes stacked above the shapes (new `LayoutElement.labelRow`) rather than the states stepping outwards off the edge.
