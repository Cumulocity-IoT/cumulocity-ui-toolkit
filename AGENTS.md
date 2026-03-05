# AGENTS.md — Cumulocity UI Toolkit

Guidance for AI agents working in this repository.

---

## Project Overview

This is a **pnpm monorepo** of Angular 18 UI plugins (widgets) for the Cumulocity IoT platform, maintained by the Cumulocity UI Guild. Each plugin is a self-contained Cumulocity package that can be built and deployed independently.

**Tech stack:** Angular 18 · TypeScript · pnpm workspaces · Jest (unit) · Cypress (e2e) · ESLint · tsdown (shared library build) · `@c8y/devkit` (plugin build)

---

## Repository Layout

```
cumulocity-ui-toolkit/
├── angular.json              # Single Angular workspace – all plugins registered here
├── package.json              # Root scripts and shared dependencies
├── pnpm-workspace.yaml       # Workspace: packages/* + test/
├── jest.config.ts            # Root Jest orchestrator (delegates to per-package configs)
├── setup-jest.ts             # Global Jest setup (Angular TestBed + Web Streams polyfills)
├── eslint.config.mjs         # Shared flat ESLint config
├── tsconfig.json             # Root TypeScript config with path aliases for shared/
│
├── packages/
│   ├── shared/               # Internal library: components, pipes, services, helpers
│   │   └── src/index.ts      # Barrel export – the public API of shared/
│   ├── energy-consumption-widget/
│   ├── favorites-manager/
│   ├── kpi-widget/
│   ├── layered-map/
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   └── tenant-option-management/
│
├── test/                     # Cypress e2e suite (own pnpm workspace)
│   ├── cypress/e2e/          # One spec file per plugin
│   └── config/               # Per-plugin Cypress configs
│
└── tools/                    # Node.js build utilities
    ├── generate-scripts.js   # Auto-generates package.json scripts from angular.json
    ├── generate-assets.js    # Generates typed assets.ts barrel from asset folders
    ├── postbuild.js          # Post-build orchestration
    └── build-rename.js       # Renames ZIP archives to include version number
```

---

## Common Commands

All commands run from the **repository root** unless noted.

| Purpose | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Build all plugins | `pnpm run build` |
| Build a single plugin | `pnpm run build:<name>` (e.g. `build:kpi-widget`) |
| Serve a plugin locally | `pnpm run serve:<name>` (requires `C8Y_BASEURL` + `C8Y_SHELL_TARGET` env vars) |
| Run all unit tests | `pnpm test` |
| Run unit tests for one plugin | `pnpm run test:<name>` (e.g. `test:favorites`) |
| Lint | `pnpm run lint` |
| Lint with auto-fix | `pnpm run lint:fix` |
| Run Cypress e2e (all) | `pnpm run e2e:run` |
| Run Cypress e2e (one plugin) | `pnpm run e2e:run:<name>` |
| Open Cypress UI | `pnpm run e2e:open` |
| Regenerate package.json scripts | `pnpm run generate:scripts` |
| Clean dist/ | `pnpm run clean` |

---

## Adding or Modifying a Plugin

1. **Register in `angular.json`** — Add an entry under `"projects"` following the existing pattern (`plugin.<name>`).
2. **Run `pnpm run generate:scripts`** — This auto-generates `build:<name>`, `serve:<name>`, and `test:<name>` entries in the root `package.json`. Do **not** hand-edit those sections.
3. **Create a Jest config** — Copy an existing `packages/<plugin>/jest.config.ts` and update the `displayName`.
4. **Import from shared** — Use `import { ... } from 'shared'` (resolved via `tsconfig.json` path alias). Never use relative paths that cross package boundaries.
5. **Assets** — Place static assets in `packages/<plugin>/public/` or `packages/<plugin>/src/assets/`. Run `pnpm run generate:assets` to regenerate the typed barrel if needed.

---

## Shared Library (`packages/shared`)

- The public API is defined entirely in `src/index.ts`.
- Built with **tsdown** (`pnpm --filter shared build`), not Angular CLI.
- When adding new exports, always add them to `src/index.ts`.
- Unit tests inside `shared/` use the root `setup-jest.ts` (Angular TestBed environment).

---

## Unit Testing (Jest)

- Test files: `**/*.spec.ts` inside `packages/`.
- The root `jest.config.ts` runs all per-package `jest.config.ts` as Jest projects.
- `packages/shared/jest.config.cjs` uses CommonJS format because the shared package has `"type": "module"`.
- To run a single package's tests: `pnpm exec jest --config packages/<plugin>/jest.config.ts`.
- Use `--passWithNoTests` when a package has no tests yet.
- Helpers for Angular TestBed mocking are in `packages/shared/src/helpers/auto-mock.helper.ts`.

---

## E2E Testing (Cypress)

- Located in `test/` (separate pnpm workspace — run `pnpm install` inside `test/` if needed).
- One spec file per plugin: `test/cypress/e2e/<plugin-name>.cy.ts`.
- Per-plugin configs live in `test/config/<plugin-name>.config.ts`.
- Requires a running Cumulocity backend (`C8Y_BASEURL`) and a deployed plugin.

---

## Code Conventions

- **Style:** LESS (`.less`) for component styles; configured globally in `angular.json` schematics.
- **Linting:** Flat ESLint config (`eslint.config.mjs`) covers TypeScript and Angular templates.
- **No cross-package relative imports** — always import from the `shared` alias, never `../../shared/src/...`.
- **Cumulocity version:** Pinned at `1021.22.146` for all `@c8y/*` packages. Do not bump these independently; they must be updated together.
- **Angular version:** `^18.2.x`. Do not use APIs or patterns from later Angular versions.
- **Barrel files:** Each feature area should have an `index.ts` that re-exports its public surface.

---

## Build Artifacts

- Output: `dist/<plugin-package-name>/` (e.g. `dist/cumulocity-kpi-widget-plugin/`).
- Post-build, `tools/postbuild.js` renames the generated ZIP to include the version from the plugin's `package.json`.
- The `clean` script removes the entire `dist/` directory before each build.

---

## MCP Server Setup

This project has a dedicated **Cumulocity documentation MCP server** that gives agents access to the official Cumulocity IoT API and SDK docs. Configure it in your editor's MCP settings (e.g. `.vscode/mcp.json`) if it is not already present:

```jsonc
{
  "servers": {
    "c8y-docs": {
      "type": "http",
      "url": "https://c8y-codex-mcp.schplitt.workers.dev/mcp"
    }
  }
}
```

Use the `c8y-docs` tools when you need to look up Cumulocity REST API endpoints, `@c8y/client` service methods, or `@c8y/ngx-components` APIs before writing or modifying code.

---

## External Reference Docs

Agents should consult these authoritative references when writing or reviewing code:

- **Angular 18 full API & guide context:** [https://angular.dev/assets/context/llms-full.txt](https://angular.dev/assets/context/llms-full.txt) — use this when working with Angular APIs, decorators, lifecycle hooks, signals, or framework patterns.
- **Mastering TypeScript skill:** [https://github.com/SpillwaveSolutions/mastering-typescript-skill/tree/main/mastering-typescript](https://github.com/SpillwaveSolutions/mastering-typescript-skill/tree/main/mastering-typescript) — follow the patterns and conventions described here for all TypeScript code in this repository.

---

## What to Avoid

- Do **not** manually add `serve:*`, `build:*`, or `test:*` scripts to the root `package.json` — use `generate:scripts`.
- Do **not** edit `dist/` — it is ephemeral build output.
- Do **not** install packages directly into a plugin's `node_modules`; all dependencies are hoisted to the root via pnpm (`.npmrc`: `shamefully-hoist=true`).
- Do **not** use `CommonJS require()` in Angular source files — this is an ESM workspace.
- Do **not** commit environment variables. The `C8Y_BASEURL` and `C8Y_SHELL_TARGET` values should come from a local `.env` file or shell environment.
