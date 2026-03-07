# XSD Schema for VDI 3682 XML Validation

This directory contains the **HSU Hamburg FPD_Schema.xsd** as a Git submodule,
used to validate XML imports and exports against the VDI 3682 standard.

## Setup

The schema files are included as a Git submodule. After cloning this repository:

```bash
git submodule update --init
```

This populates `backend/schemas/IndustrialStandard-XSD-VDI3682/` with:

- `FPD_Schema.xsd` — main schema used for validation
- `FPD_Complete_Schema.xsd` — extended schema
- `FPD_Visual_Extension.xsd` — visual extension schema

## How it works

- **XML Import**: Uploaded XML files are validated against `FPD_Schema.xsd`.
  Validation errors are returned as warnings (non-blocking).
- **XML Export**: Exported XML is validated after generation. Warnings are
  returned in the `X-XSD-Warnings` response header.
- If the submodule is not initialized, a warning is returned instead of
  a validation error.

## Source

The XSD schema is maintained at:
> https://github.com/hsu-aut/IndustrialStandard-XSD-VDI3682 (MIT License)

## Reference

> H. Nabizada, T. Jeleniewski, A. Kocher, A. Fay,
> "Vorschlag fuer eine XML-Repraesentation der Formalisierten
>  Prozessbeschreibung nach VDI/VDE 3682",
> 17. Fachtagung EKA, 2022.
