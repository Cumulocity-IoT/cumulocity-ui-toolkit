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
│   ├── index-db-cache/
│   ├── kpi-widget/
│   ├── layered-map-widget/
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   ├── smart-views/          # NOT registered in angular.json (no build/test targets)
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
| Run unit tests for one plugin (CI) | `pnpm run test:<name>` (e.g. `test:favorites-manager`) |
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
5. **Assets** — Place static assets in `packages/<plugin>/public/` and register that directory in the plugin's `assets` array in `angular.json`. Asset paths there are **workspace-root relative**, so they must include the `packages/<plugin>/` prefix. Assets imported from TypeScript (e.g. `assets/preview.png` via a generated `assets.ts` barrel) are bundled by the build and need no `angular.json` entry — run `pnpm run generate:assets` to regenerate that barrel.

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
- All 10 Angular projects in `angular.json` (`shared` + 9 plugins; `smart-views` is not registered) have a `test` architect target.
- Run a single project: `pnpm exec ng test <project> --watch=false --browsers=ChromeHeadlessCI`
- `ChromeHeadlessCI` custom launcher (defined in `karma.conf.js`) adds `--no-sandbox --disable-gpu --disable-dev-shm-usage` — required in CI.
- Test helper for creating Jasmine spies: `packages/shared/src/helpers/auto-mock.helper.ts`.
- There is **no Jest** in this repository. Do not add `jest`, `jest-preset-angular`, or any `jest.*` config files.

---

## E2E Testing (Cypress)

- **When writing, fixing, or verifying e2e tests, follow the project skill `.claude/skills/write-e2e-cumulocity-cypress-test/SKILL.md`** — it defines the mandatory workflow (preflight → discover → write → verify-in-a-loop → finish). A test is not done until it has passed a headless run.
- Detailed suite documentation lives in **`test/AGENTS.md`** (support library, factories, intercepts, page objects, selectors, cleanup pattern). Read it before writing any spec.
- Located in `test/` (separate pnpm workspace — run `pnpm install` inside `test/` if needed).
- One spec file per plugin: `test/cypress/e2e/<plugin-name>.cy.ts`.
- Per-plugin configs in `test/config/<plugin-name>.config.ts` import `cumulocity.config.ts` from the plugin and derive the `C8Y_SHELL_EXTENSION` (Module Federation remotes) dynamically from `runTime.remotes`. All delegate to `test/config/base.config.ts`.
- Reusable test infrastructure lives in `test/cypress/support/` (`commands.ts` with `cy.visitShellAndWaitForSelector`, plus `api/`, `factories/`, `intercepts/`, `page-objects/`, `selectors/`, `utils/`). `cypress-terminal-report` is installed — failed runs print the full request trace.
- `test/tsconfig.json` has `resolveJsonModule: true` and `skipLibCheck: true`.
- Requires a live Cumulocity tenant plus the plugin served locally (`pnpm run serve:<plugin>`). Environment comes from a **`.env` file at the repository root**, loaded by `base.config.ts` via `dotenv`. Keys (the config file is the authority on the mapping): required `C8Y_USERNAME`, `C8Y_PASSWORD`, `C8Y_TENANT`; optional `C8Y_CYPRESS_URL` (dev-server URL, default `http://localhost:9001/`, exposed to specs as `C8Y_BASEURL`) and `C8Y_SHELL_TARGET` (default `cockpit-test-1023`). `C8Y_TOKEN` is populated automatically via `oauthLogin` at startup.

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

The root `test` script (which chains all 10 suites sequentially) is also regenerated. Do **not** hand-edit anything after the `--generated----------` marker in `package.json`. CI verifies this: a change to root configuration re-runs `generate:scripts` and fails if `package.json` is stale.

---

## Build Artifacts

- Output: a ZIP archive per plugin in `dist/` (e.g. `dist/cumulocity-kpi-widget-plugin.zip`).
- Post-build, `tools/postbuild.js` renames the generated ZIP to include the version from the plugin's `package.json` (e.g. `dist/cumulocity-kpi-widget-plugin_1.0.4.zip`).
- The `clean` script removes the entire `dist/` directory before each build.

---

## MCP Servers

### `c8y-web-sdk-knowledge` — use FIRST for all Cumulocity development

A local knowledge-graph MCP server over the Cumulocity Web SDK source. **For any development task that touches Cumulocity APIs — `@c8y/client`, `@c8y/ngx-components`, hooks, widgets, services, models — query this server FIRST, before web search, before grepping `node_modules`, and before writing code from memory.** SDK bundles in `node_modules` are minified; grepping them wastes time and produces wrong answers, while this server resolves the real, version-accurate API surface.

Available tools:

| Tool | Use for |
|---|---|
| `resolve_symbol` | Resolve an exact SDK symbol (class, service, interface, hook) to its definition |
| `get_node` | Fetch full details of a known node (members, signatures, docs) |
| `find_usage` | Find where a symbol is used across the SDK — real-world usage patterns |
| `search_concept` | Semantic search when you only know the concept, not the symbol name |

Recommended flow: `search_concept` (when unsure of the name) → `resolve_symbol` → `get_node` for details → `find_usage` for patterns. Only fall back to other sources (c8y-docs, web search) if the knowledge server has no answer.

The server is distributed as a **GitHub package** (`@cumulocity-iot/c8y-web-sdk-knowledge-mcp`) — no checkout or build needed. One-time setup: add these two lines to your `~/.npmrc` (create the file if it doesn't exist), using a token with `read:packages` access:

```ini
@cumulocity-iot:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<your token>
```

After that it works like a regular npm package. Register it at the **user level** in Claude Code:

```bash
claude mcp add c8y-web-sdk-knowledge -- npx -y @cumulocity-iot/c8y-web-sdk-knowledge-mcp
```

Equivalent `~/.claude.json` → `mcpServers` entry:

```jsonc
{
  "mcpServers": {
    "c8y-web-sdk-knowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cumulocity-iot/c8y-web-sdk-knowledge-mcp"]
    }
  }
}
```

If its tools (`mcp__c8y-web-sdk-knowledge__*`) are not available in your session, tell the user instead of silently falling back.

### `c8y-docs` — official documentation (secondary)

Hosted MCP server for the official Cumulocity IoT API and SDK docs. Use it as a complement to `c8y-web-sdk-knowledge` for REST API endpoint documentation and conceptual guides. Configure in your editor's MCP settings (e.g. `.vscode/mcp.json`) if not already present:

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
