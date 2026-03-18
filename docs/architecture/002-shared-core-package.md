# ADR-002: Shared @fpd-editor/core Package

## Status

Accepted

## Context

FPD parsing, validation, layout computation, SVG rendering, and export logic existed in two
places: a Python backend and a TypeScript implementation inside the VS Code extension. Both
were functionally equivalent but maintained separately, leading to divergence risk.

## Decision

Extract the TypeScript implementation into a standalone `@fpd-editor/core` package that
serves as the single source of truth. Both the VS Code extension and the new TypeScript
backend import from this package.

## Consequences

- **Single source of truth** — parser/layout/export logic lives in one place
- **VS Code extension** imports `@fpd-editor/core` directly (no server needed)
- **TypeScript backend** wraps `@fpd-editor/core` with HTTP endpoints (Fastify)
- **Python backend** can be retired once the TS backend reaches feature parity
- Breaking changes in core affect all consumers — requires careful versioning
