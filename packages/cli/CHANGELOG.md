# @fpd-editor/cli

## 0.1.0

### Minor Changes

- d80bece: Add the `fpd` CLI (`check`, `render`, `import`) so AI agents can write, edit, validate and export FPDs in any project. It ships as an AI skill (`SKILL.md` plus the bundled CLI) with the VS Code extension.

    The XML importer now restores usages (`PO <..> TR`) from the per-element `<usages>` references the exporter writes; before, every usage was dropped when re-importing an exported XML file.

### Patch Changes

- Updated dependencies [d80bece]
- Updated dependencies [f5fb6de]
    - @fpd-editor/core@0.4.1
