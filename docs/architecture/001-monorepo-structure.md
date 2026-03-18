# ADR-001: Monorepo Structure with pnpm Workspaces

## Status

Accepted

## Context

The repository contained a Python backend, a React frontend, and a VS Code extension in
a flat directory structure with no shared dependency management. The TypeScript core logic
(parser, layout, renderer, exporters) was duplicated — once in the extension and once
functionally equivalent in the Python backend.

## Decision

Adopt a monorepo structure using **pnpm workspaces** and **Turborepo** for build
orchestration. Packages live under `packages/` and shared tooling configs under `tooling/`.

## Consequences

- Single `pnpm install` sets up all packages
- Turborepo caches builds and parallelizes independent tasks
- Shared TypeScript/ESLint/Prettier configs prevent drift
- Package boundaries enforce explicit dependency declarations
- CI runs once per PR, building only what changed
