# Contributing to Notylo

Thanks for helping improve Notylo. The project is a pnpm monorepo containing the web application, API, desktop shell and shared packages.

## Prerequisites

- Node.js 24 or newer
- pnpm 11.19.0 (the repository pins the package manager through `packageManager`)
- Chromium dependencies when running Playwright locally
- Docker when working on the full cloud stack

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
```

For a local-only web session without account requirements:

```bash
VITE_REQUIRE_AUTH=false pnpm dev
```

Useful development commands:

```bash
pnpm dev
pnpm dev:api
pnpm dev:desktop
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Repository structure

- `apps/web` — React/Vite web and PWA client
- `apps/api` — Fastify cloud API
- `apps/desktop` — Tauri desktop packaging
- `packages/document-model` — notebook/page/object model and operations
- `packages/canvas-engine` — canvas/camera primitives
- `packages/persistence` — local persistence
- `packages/import-export` — portable note import/export
- `packages/math-engine` — math evaluation utilities
- `packages/sync` — experimental/future sync primitives
- `packages/shared` — shared utilities and types

## Making changes

Keep changes focused and avoid mixing unrelated refactors with product behavior changes. Preserve existing notebook compatibility and local-first behavior. Changes to the editor should be especially careful around stylus input, pressure, erasing, selection, zoom/pan and undo/redo.

Before opening a pull request, run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

If a command cannot be run in your environment, mention it clearly in the pull request.

## Tests

Add or update tests when changing observable behavior. Prefer pure unit tests for document, geometry and synchronization logic, and Playwright for user-critical workflows.

Do not fix a failing check by disabling TypeScript, ESLint or an existing test. Avoid unnecessary `any`, `@ts-ignore` and global lint suppressions.

## Pull requests

A good pull request should explain:

- what changed;
- why it changed;
- how it was tested;
- any migration or compatibility considerations;
- screenshots for meaningful visual changes.

Keep generated test artifacts out of commits unless they are intentionally used by the documentation.
