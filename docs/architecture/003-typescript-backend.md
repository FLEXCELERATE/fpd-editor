# ADR-003: TypeScript Backend Replacing Python

## Status

In Progress

## Context

The Python backend (FastAPI) provides REST endpoints for parsing, rendering, and exporting
FPD diagrams. With the core logic now available as a TypeScript package, maintaining a
separate Python implementation adds maintenance overhead and requires contributors to
know two languages.

## Decision

Build a new backend using **Fastify** (TypeScript) that wraps `@fpd-editor/core` with the
same REST API endpoints as the Python backend. The Python backend remains available during
the transition.

## Consequences

- Contributors only need TypeScript knowledge
- Backend and core share the same type definitions
- Python-only features (PNG export via cairosvg, XSD validation via lxml) need
  TypeScript equivalents or acceptable alternatives
- The Python backend (`backend/` directory) stays until feature parity is confirmed
