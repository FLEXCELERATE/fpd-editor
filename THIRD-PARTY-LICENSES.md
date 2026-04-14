# Third-Party Licenses

This project uses the following third-party dependencies. Their licenses require
attribution when redistributing.

## Python Dependencies

### FastAPI

- **License:** MIT
- **URL:** https://github.com/tiangolo/fastapi

### Uvicorn

- **License:** BSD-3-Clause
- **URL:** https://github.com/encode/uvicorn
- **Copyright:** Copyright (c) 2017-present, Encode OSS Ltd.

### Pydantic

- **License:** MIT
- **URL:** https://github.com/pydantic/pydantic

### python-multipart

- **License:** Apache-2.0
- **URL:** https://github.com/Kludex/python-multipart

### lxml

- **License:** BSD-3-Clause
- **URL:** https://github.com/lxml/lxml
- **Copyright:** Copyright (c) 2004 Infrae. All rights reserved.

### ReportLab

- **License:** BSD-2-Clause
- **URL:** https://www.reportlab.com/
- **Copyright:** Copyright (c) 2000-2024, ReportLab Inc.

### xmlschema

- **License:** MIT
- **URL:** https://github.com/sissaschool/xmlschema

### CairoSVG

- **License:** LGPL-3.0-or-later
- **URL:** https://courtbouillon.org/cairosvg
- **Copyright:** Copyright (c) 2011-2024, CourtBouillon
- **Note:** Used as a runtime dependency for SVG-to-PNG conversion. Not modified.
  LGPL-3.0 permits use as an unmodified library in MIT-licensed projects.

### cairocffi

- **License:** BSD-3-Clause
- **URL:** https://github.com/Kozea/cairocffi
- **Copyright:** Copyright (c) 2013-2024, Simon Sapin and contributors
- **Note:** Required by CairoSVG.

### Pillow

- **License:** HPND (Historical Permission Notice and Disclaimer)
- **URL:** https://github.com/python-pillow/Pillow
- **Copyright:** Copyright (c) 1995-2024, Fredrik Lundh, Jeffrey A. Clark, and contributors
- **Note:** Required by CairoSVG for PNG output.

## JavaScript/TypeScript Dependencies

### React

- **License:** MIT
- **URL:** https://github.com/facebook/react

### Monaco Editor

- **License:** MIT
- **URL:** https://github.com/microsoft/monaco-editor

### Vite

- **License:** MIT
- **URL:** https://github.com/vitejs/vite

### TypeScript

- **License:** Apache-2.0
- **URL:** https://github.com/microsoft/TypeScript

### jsPDF

- **License:** MIT
- **URL:** https://github.com/parallax/jsPDF

### svg2pdf.js

- **License:** MIT
- **URL:** https://github.com/yWorks/svg2pdf.js

### Axios (VS Code Extension)

- **License:** MIT
- **URL:** https://github.com/axios/axios

## Bundled Schemas

### HSU Hamburg VDI 3682 XSD Schema

- **Repository:** https://github.com/hsu-aut/IndustrialStandard-XSD-VDI3682
- **License:** MIT
- **Copyright:** Copyright (c) HSU Hamburg
- **Note:** Included as a Git submodule in `backend/schemas/IndustrialStandard-XSD-VDI3682/`.
  Used for XSD validation of XML imports and exports.
- **Reference:** H. Nabizada, T. Jeleniewski, A. Köcher, A. Fay, "Vorschlag für eine
  XML-Repräsentation der Formalisierten Prozessbeschreibung nach VDI/VDE 3682", 17. Fachtagung EKA, 2022.

## Dev Dependencies

### pytest

- **License:** MIT
- **URL:** https://github.com/pytest-dev/pytest

### httpx

- **License:** BSD-3-Clause
- **URL:** https://github.com/encode/httpx
- **Copyright:** Copyright (c) 2019-present, Encode OSS Ltd.
