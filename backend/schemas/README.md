# XSD Schema for VDI 3682 XML Validation

This directory is reserved for the **HSU Hamburg FPD_Schema.xsd** schema files.
Our XML export is structurally compatible with this schema.

## Optional: Download the HSU Schema

To enable XSD validation during XML import, download the schema files from:

> https://github.com/hsu-aut/IndustrialStandard-XSD-VDI3682

Place the following file in this directory:

```
backend/schemas/
  FPD_Schema.xsd              <-- required for validation
```

The import endpoint will automatically detect and validate against `FPD_Schema.xsd`
if it is present. Without it, XML import still works — just without schema validation.

## Reference

> H. Nabizada, T. Jeleniewski, A. Kocher, A. Fay,
> "Vorschlag fuer eine XML-Repraesentation der Formalisierten
>  Prozessbeschreibung nach VDI/VDE 3682",
> 17. Fachtagung EKA, 2022.
