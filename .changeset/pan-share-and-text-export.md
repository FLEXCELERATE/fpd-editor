---
'@fpd-editor/core': patch
'fpd-editor-frontend': patch
---

Fix panning, remove the Share button, and stop the text export losing elements.

- **Text export data loss.** With a `system { }` block present, `exportText` only wrote elements whose `systemId` matched a system — plus cross-system _flows_. States, operators, resources and usages belonging to no system were dropped, and re-reading the file then dropped the flows referencing them too. A document in that shape was destroyed by saving it. Elements outside any system are now written at the top level.
- **Panning.** The renderer's opaque background rect covered the whole diagram and swallowed every `mousedown`, and the frontend only started a pan when the event target was the bare SVG. Together they left 28% of the canvas pannable. The background rect is now `pointer-events="none"` (it is decoration and exists so a standalone SVG file is opaque), and panning starts anywhere on the canvas.
- **Share button removed.** It copied a `#fpd=` link built from `window.location`, which is useless from a dev server. Links of that shape still open; only the button and `buildShareUrl` are gone.
