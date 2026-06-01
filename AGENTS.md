# AGENTS.md — Cumulocity UI Toolkit

Guidance for AI agents working in this repository.

---

## Project Overview

This is a **pnpm monorepo** of Angular 20 UI plugins (widgets) for the Cumulocity IoT platform, maintained by the Cumulocity UI Guild. Each plugin is a self-contained Cumulocity package that can be built and deployed independently.

**Tech stack:** Angular 20 · TypeScript 5.9 · pnpm 10 workspaces · Karma + Jasmine (unit) · Cypress (e2e) · ESLint · ng-packagr (shared library build) · `@c8y/devkit` (plugin build) · Cumulocity Web SDK 1023.14.x

---

## Repository Layout

```
cumulocity-ui-toolkit/
├── angular.json              # Single Angular workspace – all plugins registered here
├── package.json              # Root scripts and shared dependencies
├── pnpm-workspace.yaml       # Workspace: packages/* + test/
├── .npmrc                    # shamefully-hoist=true
├── .pnpmfile.cjs             # Forces @c8y/devkit to use TypeScript 5.9.x
├── karma.conf.js             # Shared Karma config (Jasmine, Chrome, ChromeHeadlessCI)
├── eslint.config.mjs         # Shared flat ESLint config
├── tsconfig.json             # Root TypeScript config with path aliases for shared/
│
├── packages/
│   ├── shared/               # Internal library: components, pipes, services, helpers
│   │   ├── ng-package.json   # ng-packagr config (FESM2022 output)
│   │   ├── tsconfig.json
│   │   ├── tsconfig.spec.json
│   │   └── src/index.ts      # Barrel export – the public API of shared/
│   ├── energy-consumption-widget/
│   ├── favorites-manager/
│   ├── kpi-widget/
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   └── tenant-option-management/
│
├── test/                     # Cypress e2e suite (own pnpm workspace)
│   ├── cypress/e2e/          # One spec file per plugin
│   ├── config/               # Per-plugin Cypress configs + base.config.ts
│   └── tsconfig.json         # resolveJsonModule + skipLibCheck enabled
│
└── tools/                    # Node.js build utilities
    ├── generate-scripts.mts  # Auto-generates package.json scripts from angular.json (ESM TS)
    ├── generate-assets.js    # Generates typed assets.ts barrel from asset folders
    ├── convert-locales.js    # Converts locale .po files
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
| Run unit tests for one plugin (CI) | `pnpm run test:<name>` (e.g. `test:favorites`) |
| Run unit tests for one plugin (watch) | `pnpm run test:watch:<name>` |
| Lint | `pnpm run lint` |
| Lint with auto-fix | `pnpm run lint:fix` |
| Run Cypress e2e (all) | `pnpm run e2e:run` |
| Run Cypress e2e (one plugin) | `pnpm run e2e:run:<name>` |
| Open Cypress UI | `pnpm run e2e:open` |
| Regenerate package.json scripts | `pnpm run generate:scripts` |
| Clean dist/ | `pnpm run clean` |

---

## Adding or Modifying a Plugin

1. **Register in `angular.json`** — Add an entry under `"projects"` following the existing pattern (`plugin.<name>`). Include a `test` architect target using `@angular/build:karma`, pointing to `karma.conf.js` and the package's `tsconfig.spec.json`.
2. **Run `pnpm run generate:scripts`** — Auto-generates `build:<name>`, `serve:<name>`, `test:<name>`, and `test:watch:<name>` entries in the root `package.json`. Do **not** hand-edit the generated section (keyed by the `--generated----------` marker).
3. **Add `tsconfig.spec.json`** — Copy from an existing plugin. Extends root `tsconfig.json`; sets `"types": ["jasmine", "node"]`.
4. **Import from shared** — Use the path aliases (`~services/*`, `~helpers/*`, etc.) defined in the root `tsconfig.json`. Never use relative paths that cross package boundaries.
5. **Assets** — Place static assets in `packages/<plugin>/public/` or `packages/<plugin>/src/assets/`. Run `pnpm run generate:assets` to regenerate the typed barrel if needed.

---

## Shared Library (`packages/shared`)

- The public API is defined entirely in `src/index.ts`.
- Built with **ng-packagr** (`ng build shared`). Output goes to `packages/shared/dist/` (FESM2022 format).
- When adding new exports, always add them to `src/index.ts`.
- Unit tests inside `shared/` use Karma + Jasmine via the `shared` Angular project in `angular.json`.

---

## Unit Testing (Karma + Jasmine)

- Test framework: **Jasmine**. Test runner: **Karma** via `@angular/build:karma`.
- Test files: `**/*.spec.ts` inside `packages/`.
- The root `karma.conf.js` is shared by all projects.
- Each package has a `tsconfig.spec.json` with `"types": ["jasmine", "node"]`.
- All 8 Angular projects in `angular.json` have a `test` architect target.
- Run a single project: `pnpm exec ng test <project> --watch=false --browsers=ChromeHeadlessCI`
- `ChromeHeadlessCI` custom launcher (defined in `karma.conf.js`) adds `--no-sandbox --disable-gpu --disable-dev-shm-usage` — required in CI.
- Test helper for creating Jasmine spies: `packages/shared/src/helpers/auto-mock.helper.ts`.
- There is **no Jest** in this repository. Do not add `jest`, `jest-preset-angular`, or any `jest.*` config files.

---

## E2E Testing (Cypress)

- Located in `test/` (separate pnpm workspace — run `pnpm install` inside `test/` if needed).
- One spec file per plugin: `test/cypress/e2e/<plugin-name>.cy.ts`.
- Per-plugin configs in `test/config/<plugin-name>.config.ts` import `cumulocity.config.ts` from the plugin and derive the `C8Y_SHELL_EXTENSION` (Module Federation remotes) dynamically from `runTime.remotes`.
- `test/tsconfig.json` has `resolveJsonModule: true` and `skipLibCheck: true`.
- Requires a running Cumulocity backend and shell. Set `C8Y_BASEURL`, `C8Y_SHELL_TARGET`, `C8Y_USERNAME`, `C8Y_PASSWORD` in the environment or a `.env` file.

---

## Code Conventions

- **Angular version:** `^20.x`. Do not use APIs from later Angular versions.
- **Standalone components only:** All components and pipes are `standalone: true`. There are **no NgModules** in plugin code.
- **Provider arrays replace NgModules:** Plugin entrypoints export named provider arrays (e.g. `EnergyConsumptionWidgetPluginProviders`). Deprecated `*Module` aliases may be kept for backward compatibility but must alias the provider array, not a real NgModule class.
- **`cumulocity.config.ts`:** `exports[].module` and `remotes` entries must reference the provider array name. `exports[].path` must point to the file that exports it.
- **Widget hooks:** Use `hookWidget` with `loadComponent` / `loadConfigComponent` (lazy). Never use the static `component` / `configComponent` fields on widget definitions.
- **Route hooks:** Use `hookRoute` with `loadComponent` (lazy).
- **Drawer / action hooks:** `hookDrawer` and `hookAction` accept only a static `component` reference — SDK types have no lazy option. This is correct and expected.
- **`gettext` import:** Always import from `@c8y/ngx-components/gettext`, never from the main `@c8y/ngx-components` barrel.
- **Locale imports in `bootstrap.ts`:** The `./locales/de.po` import must appear after `@angular/compiler` and before other Angular imports.
- **Dependency injection:** Prefer `inject()` over constructor injection in new code.
- **Constructor side-effects:** Never perform async work or call services in a constructor. Use `ngOnInit()`.
- **Style:** LESS (`.less`) for component styles.
- **Linting:** Flat ESLint config (`eslint.config.mjs`) covers TypeScript and Angular templates.
- **No cross-package relative imports** — always use the path aliases, never `../../shared/src/...`.
- **Cumulocity SDK version:** Pinned at `1023.14.x` for all `@c8y/*` packages. Do not bump packages independently; they must be updated together.
- **Barrel files:** Each feature area should have an `index.ts` that re-exports its public surface.
- **No `console.warn` / `console.log` in production code.**

---

## Script Generation

The `tools/generate-scripts.mts` file is an **ESM TypeScript** script (`.mts` extension — run with `node --experimental-strip-types`). It reads all projects from `angular.json` and regenerates the `build:*`, `serve:*`, `test:*`, and `test:watch:*` entries in `package.json`. The source of truth for which projects get test scripts is whether the project has a `@angular/build:karma` test target in `angular.json`.

The root `test` script (which chains all 8 suites sequentially) is also regenerated. Do **not** hand-edit anything after the `--generated----------` marker in `package.json`.

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

- **Angular 20 full API & guide context:** [https://angular.dev/assets/context/llms-full.txt](https://angular.dev/assets/context/llms-full.txt) — use this when working with Angular APIs, decorators, lifecycle hooks, signals, or framework patterns.
- **Mastering TypeScript skill:** [https://github.com/SpillwaveSolutions/mastering-typescript-skill/tree/main/mastering-typescript](https://github.com/SpillwaveSolutions/mastering-typescript-skill/tree/main/mastering-typescript) — follow the patterns and conventions described here for all TypeScript code in this repository.

---

## What to Avoid

- Do **not** add Jest, `jest-preset-angular`, or any `jest.*` / `setup-jest.*` files. The test stack is Karma + Jasmine exclusively.
- Do **not** manually add `serve:*`, `build:*`, `test:*`, or `test:watch:*` scripts to the root `package.json` — use `generate:scripts`.
- Do **not** edit `dist/` — it is ephemeral build output.
- Do **not** install packages directly into a plugin's `node_modules`; all dependencies are hoisted to the root via pnpm (`.npmrc`: `shamefully-hoist=true`).
- Do **not** use `CommonJS require()` in Angular source files — this is an ESM workspace.
- Do **not** create NgModules (`@NgModule`). Use standalone components and provider arrays.
- Do **not** use static `component` / `configComponent` on `hookWidget` definitions — use `loadComponent` / `loadConfigComponent`.
- Do **not** import `gettext` from `@c8y/ngx-components` — use `@c8y/ngx-components/gettext`.
- Do **not** commit environment variables. Use a local `.env` file or shell environment for `C8Y_BASEURL`, `C8Y_SHELL_TARGET`, `C8Y_USERNAME`, `C8Y_PASSWORD`.
