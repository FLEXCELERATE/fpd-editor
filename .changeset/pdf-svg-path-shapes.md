---
'@fpd-editor/core': patch
---

PDF export draws arrowheads, energy diamonds, information hexagons and technical resources again. They were placed below the page because `drawSvgPath` flips the y axis a second time.
