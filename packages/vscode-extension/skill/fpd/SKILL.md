---
name: fpd
description: Create, edit, validate and export VDI 3682 Formalized Process Descriptions (FPD, Formalisierte Prozessbeschreibung) as .fpd text with SVG/PDF/XML output. Use when the user wants a process description, Verfahrens- or Prozessbeschreibung, process module / MTP / VDI 2776 module diagram, process operators, states (product, energy, information) or technical resources — or wants to change an existing .fpd file or import a VDI 3682 XML. Not for P&ID / R&I flow diagrams, BPMN, or writing MTP / AutomationML manifests themselves.
allowed-tools: Bash(node *fpd.mjs*), PowerShell(node *fpd.mjs*)
---

# FPD (VDI 3682)

You write FPD **text**; the bundled CLI validates and renders it. Never write SVG/XML by hand and never read generated SVG/PDF/XML back — the CLI's one-line output is all you need.

CLI: `node "<skill-dir>/bin/fpd.mjs"`, where `<skill-dir>` is the folder of this SKILL.md (`.claude/skills/fpd/` or `.agents/skills/fpd/`); under Claude Code that is `${CLAUDE_SKILL_DIR}`. Requires Node 20+.

```
fpd check  <file.fpd>                                   # validate, one-line summary
fpd render <file.fpd> [--format svg,pdf,xml] [-o <file> | --out-dir <dir>]
                      [--page-size A4|Letter] [--orientation portrait|landscape]
fpd import <file.xml> [-o <file.fpd>] [--force]         # VDI 3682 XML -> .fpd
```

Exit 0 = ok (`OK "<title>": … -> <files>`), 1 = FPD errors (`ERROR Line n: …`, nothing written), 2 = bad arguments/file. `WARN` lines are VDI 3682 rule violations — fix them too. Default output is next to the input (`anlage.fpd` → `anlage.svg`).

## Workflow

- **New FPD:** write `<name>.fpd`, run `check`, fix until clean, then `render` (SVG default; add `pdf`/`xml` when asked).
- **Small change** ("add operator X between A and B", "move E1 left"): edit only the affected lines with the Edit tool, run `check`, re-`render` the formats that already exist next to the file. Don't rewrite the whole file.
- Keep IDs stable when editing; they are the XML `uniqueIdent`s.
- Run each CLI call as its own Bash command (no `&&`/`;` chains, no `cd`) so one permission rule covers it. `render` already validates, so `check` is only needed when you don't render.

## Syntax

```fpd
@startfpd
title "Reactor Module"

system "Reactor" {
  product P1 "Catalyst Solution" @boundary-left
  product P2 "Reactor Product" @boundary-right
  energy E1 "Thermal Energy" @boundary-top
  information I1 "Temperature"
  process_operator PO1 "Reacting"
  technical_resource TR1 "Stirred Tank Reactor"

  P1 --> PO1
  E1 --> PO1
  I1 --> PO1
  PO1 --> P2
  PO1 <..> TR1
}

@endfpd
```

- Required: `@startfpd` … `@endfpd`. `title "…"` (top level only). `// comment`.
- Element: `<keyword> <ID> "Label"` — keywords `product`, `energy`, `information` (states), `process_operator`, `technical_resource`. IDs unique; declare before use.
- `system "Name" { … }` = system boundary; several systems allowed.
- State placement (states only): `@boundary`, `@boundary-top|-bottom|-left|-right`, `@internal`.
- One connection per line, no chaining:

| Operator | Meaning          | Between                              |
| -------- | ---------------- | ------------------------------------ |
| `-->`    | flow             | state → operator or operator → state |
| `-.->`   | alternative flow | same (e.g. pass/fail outputs)        |
| `==>`    | parallel flow    | same (parallel branches)             |
| `<..>`   | usage            | `PO <..> TR` (operator first)        |

## VDI 3682 rules (the validator enforces them)

- Flows only connect a state with a process operator — never state→state or operator→operator inside a system, never to a technical resource.
- Usages only connect a process operator with a technical resource, in the same system.
- Across systems: link a state of one system to a state of another with a flow written **outside** all system blocks; operator↔state flows must not cross systems.
- No duplicate connections.

Modelling hints: operators are verbs ("Dosing", "Storing"), states are things/energies/signals, resources are equipment. Inputs on the left/top, outputs on the right, measurements as `information`.
