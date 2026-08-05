# Cumulocity UI Guild Toolkit

<div align="center">

![Logo of the Cumulocity UI Guild, showing a medieval looking shield with the letters "U" and "I"](./public/ui-guild-banner.png)

</div>

---

This is a **pnpm monorepo** of Cumulocity IoT UI plugins built with **Angular 20** and the **Cumulocity Web SDK 1023.14.x** (TypeScript 5.9, Node 24 in CI). All plugin projects are registered in a single root `angular.json` and share dependencies via pnpm workspaces. Shared logic lives in `packages/shared/`; the 10 individually deployable plugin packages live alongside it under `packages/`. Unit tests run with **Karma + Jasmine** via `@angular/build:karma`. End-to-end tests use **Cypress** with `cumulocity-cypress`, from the separate `test/` workspace.

The plugins currently in the workspace:

| Plugin | What it does |
|---|---|
| `energy-consumption-widget` | Displays consumption derived from increasing measurements. |
| `favorites-manager` | Mark any device, group, or DTM asset as a favorite; stored per user in the `currentUser` object. |
| `index-db-cache` | Caches measurement and series requests in IndexedDB via HTTP interceptors, with a drawer showing cache state. |
| `kpi-widget` | Configure inventory queries and count or aggregate result fragments client-side. |
| `layered-map-widget` | Map with position markers for `c8y_Position` devices, across multiple query-defined layers. |
| `operations-widget` | Send predefined or custom operations from configurable buttons in the Cockpit. |
| `release-notes` | Create release notes that other users can view in the shell. |
| `reminder` | Manually created reminders (Cumulocity events) attached to groups or devices, surfaced in their own drawer. |
| `smart-views` | Query-driven asset views with a configuration page and CSV export. |
| `tenant-option-management` | Create, edit, and delete tenant options, encrypted or plain, as text or JSON. |

Each plugin's own `README.md` has the details; this file documents the workspace itself.

---

## Directory Structure

```
cumulocity-ui-toolkit/
├── angular.json              # Single Angular workspace – all plugins registered here
├── package.json              # Root scripts and shared dependencies
├── pnpm-workspace.yaml       # Workspace: packages/* + test/
├── .npmrc                    # shamefully-hoist=true
├── .pnpmfile.cjs             # Forces @c8y/devkit to use TypeScript 5.9.x
├── tsconfig.json             # Root TypeScript config with path aliases for shared/
├── karma.conf.js             # Shared Karma configuration (Jasmine, Chrome, coverage)
├── eslint.config.mjs         # Shared flat ESLint config
│
├── packages/
│   ├── shared/               # Internal library – components, pipes, services, helpers
│   │   ├── ng-package.json   # ng-packagr config (builds to FESM2022)
│   │   ├── tsconfig.json
│   │   ├── tsconfig.spec.json
│   │   └── src/
│   │       ├── index.ts      # Public API barrel export
│   │       ├── components/
│   │       ├── helpers/
│   │       ├── models/
│   │       ├── pipes/
│   │       └── services/
│   │
│   ├── energy-consumption-widget/
│   ├── favorites-manager/
│   ├── index-db-cache/
│   ├── kpi-widget/
│   ├── layered-map-widget/
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   ├── smart-views/
│   └── tenant-option-management/
│
├── test/                     # Cypress E2E suite (separate pnpm workspace)
│   ├── cypress/e2e/          # One spec file per plugin
│   ├── cypress/support/      # Custom commands, page objects, intercepts, factories
│   ├── config/               # Per-plugin Cypress configs + base.config.ts
│   └── tsconfig.json
│
└── tools/                    # Node.js build utilities
    ├── generate-scripts.mts  # Auto-generates package.json scripts from angular.json
    ├── generate-assets.js    # Generates typed assets.ts barrel from asset folders
    ├── convert-locales.js    # Converts locale files
    ├── postbuild.js          # Post-build orchestration
    └── build-rename.js       # Renames ZIP archives to include version number
```

---

## pnpm Workspace

The workspace is configured in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'test'
```

- Every directory under `packages/` is a workspace package, including `shared`.
- `test/` is a workspace member but has its **own lockfile and `node_modules`** — install it with `pnpm -C test install`. The `e2e:*` root scripts all delegate via `pnpm -C test exec`.
- `pnpm-workspace.yaml` also sets `minimumReleaseAge: 10080` (7 days), so freshly published versions are not picked up immediately. `shared` is exempt via `minimumReleaseAgeExclude`.
- `.npmrc` sets `shamefully-hoist=true`, which hoists all packages to the root `node_modules/`. This is required for Angular's build tooling and the Cumulocity devkit to resolve peer dependencies. It also enables `auto-install-peers`, `strict-peer-dependencies`, and `ignore-scripts`.
- `.pnpmfile.cjs` pins the TypeScript version resolved by `@c8y/devkit` to 5.9.3 to match the workspace, preventing a `@ngtools/webpack` Debug Failure at build time.

---

## Angular Workspace

All plugins are registered as Angular projects in the single root `angular.json`. Projects follow the naming convention `plugin.<directory-name>` — the project name always matches the package directory, which is what the `serve:*` / `build:*` / `test:*` scripts and the e2e CI matrix rely on.

| Angular project                    | Package directory                    | Deployed plugin name                         |
| ---------------------------------- | ------------------------------------ | -------------------------------------------- |
| `shared`                           | `packages/shared`                    | — (internal library)                         |
| `plugin.energy-consumption-widget` | `packages/energy-consumption-widget` | `cumulocity-energy-consumption-widget-plugin` |
| `plugin.favorites-manager`         | `packages/favorites-manager`         | `cumulocity-favorites-manager-plugin`        |
| `plugin.index-db-cache`            | `packages/index-db-cache`            | `cumulocity-index-db-cache-plugin`           |
| `plugin.kpi-widget`                | `packages/kpi-widget`                | `cumulocity-kpi-aggregator-widget-plugin`    |
| `plugin.layered-map-widget`        | `packages/layered-map-widget`        | `cumulocity-layered-map-widget`              |
| `plugin.operations-widget`         | `packages/operations-widget`         | `cumulocity-operations-widget-plugin`        |
| `plugin.release-notes`             | `packages/release-notes`             | `cumulocity-release-notes-plugin`            |
| `plugin.reminder`                  | `packages/reminder`                  | `cumulocity-reminder-plugin`                 |
| `plugin.smart-views`               | `packages/smart-views`               | `cumulocity-smart-views-plugin`              |
| `plugin.tenant-option-management`  | `packages/tenant-option-management`  | `cumulocity-tenant-option-management-plugin` |

Each plugin project defines four architect targets (`shared` has only `build` and `test`):

| Target   | Builder                  | Purpose                                                  |
| -------- | ------------------------ | -------------------------------------------------------- |
| `build`  | `@c8y/devkit:build`      | Produces a deployable ZIP artifact in `dist/`            |
| `serve`  | `@c8y/devkit:dev-server` | Local development server with live reload                |
| `deploy` | `@c8y/devkit:deploy`     | Deploys the built plugin to a Cumulocity tenant          |
| `test`   | `@angular/build:karma`   | Runs unit tests with Karma + Jasmine                     |

---

## Plugin Package Structure

Each plugin under `packages/<name>/` follows this structure:

```
packages/<name>/
├── package.json            # Plugin name + version
├── README.md               # Plugin documentation (what it does, how to configure it)
├── cumulocity.config.ts    # Cumulocity runtime + build-time config (Module Federation, exports)
├── .browserslistrc         # Browser targets
├── tsconfig.app.json       # Extends root tsconfig.json (Angular build)
├── tsconfig.json           # Extends root tsconfig.json
├── tsconfig.spec.json      # Extends root tsconfig.json (types: jasmine, node)
├── src/
│   ├── main.ts             # Angular bootstrap entry point
│   ├── bootstrap.ts        # Locale + app bootstrap
│   ├── i18n.ts             # Locale registration
│   ├── app/
│   │   └── index.ts        # Exported provider arrays (the Module Federation entry points)
│   └── locales/            # .po translation files
└── public/                 # Static assets copied into the build (some plugins; others use assets/)
```

Each plugin also has its own `README.md` describing the plugin itself — this root README covers only the workspace mechanics.

### Standalone Components

All components and pipes in this workspace are standalone — nothing sets `standalone: false`. Plugin entrypoints export **provider arrays** (e.g. `KpiAggregatorWidgetPluginProviders`, `SmartViewsPluginProviders`) built from the SDK hook functions, and the `module` field of each `cumulocity.config.ts` export names one of those arrays. Several files are still named `*.module.ts` for historical reasons while exporting only a provider array.

The one real remaining `@NgModule` is `packages/index-db-cache/src/app/index-db-cache.module.ts`, which uses its constructor to register HTTP interceptors with `ApiService`. A comment in that file sketches the `provideAppInitializer` replacement for 1023.

### `cumulocity.config.ts`

The key Cumulocity-specific config for each plugin. It contains:

- **`runTime`**: Plugin metadata for the shell — name, version, CSP, and `exports` / `remotes` for Module Federation. The `module` field in each export entry names the provider array exported from the `path` file.
- **`buildTime`**: Lists packages to federate — shared from the shell rather than re-bundled. Static asset copying is configured in `angular.json` (`architect.build.options.assets`), not here.

Widget definitions use `hookWidget` with `loadComponent` / `loadConfigComponent` for lazy loading. Route hooks use `hookRoute` with `loadComponent`. Drawer and action hooks use static `component` references (SDK constraint).

---

## Shared Library (`packages/shared/`)

The `shared` package is a proper workspace library consumed by every plugin:

```json
"dependencies": {
  "shared": "workspace:*"
}
```

It is built with **ng-packagr** (`pnpm run build:shared`) to produce an FESM2022 library with TypeScript declarations. Output goes to `packages/shared/dist/` (`dest` in `ng-package.json`). Angular and Cumulocity packages are declared as **peer dependencies** so each plugin supplies its own copies.

Note that plugins normally import from the path aliases below rather than the built library, so a `build:shared` is not required before building a plugin.

### TypeScript Path Aliases

Defined in the root `tsconfig.json`:

```json
"paths": {
  "~components/*": ["./packages/shared/src/components/*"],
  "~helpers/*":    ["./packages/shared/src/helpers/*"],
  "~models/*":     ["./packages/shared/src/models/*"],
  "~pipes/*":      ["./packages/shared/src/pipes/*"],
  "~services/*":   ["./packages/shared/src/services/*"]
}
```

Usage in any plugin:

```typescript
import { LocalStorageService } from '~services/local-storage.service';
import { extractPlaceholdersFromObject } from '~helpers/extract-placeholders';
```

| Folder            | Contents                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| `src/components/` | Reusable Angular components (auto-refresh, image gallery, etc.)         |
| `src/helpers/`    | Type utilities, domain model helpers, query parsing, test auto-mock helpers |
| `src/models/`     | Shared TypeScript interfaces and types                                  |
| `src/pipes/`      | Angular pipes (file size, filter, sort, nl2br, replace, etc.)           |
| `src/services/`   | Angular services (local storage, measurements, CSV export, etc.)        |

`~helpers/auto-mock.helper` is worth knowing about: `provideMock(SomeService)` registers an auto-mocked provider whose methods are Jasmine spies, which is the standard way services are unit tested in this repo.

---

## Common Commands

All commands run from the **repository root** unless noted.

| Purpose | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Install e2e dependencies | `pnpm -C test install` |
| Build all plugins | `pnpm run build` |
| Build a single plugin | `pnpm run build:<name>` (e.g. `build:kpi-widget`) |
| Serve a plugin locally | `pnpm run serve:<name>` (requires `C8Y_BASEURL` + `C8Y_SHELL_TARGET` env vars) |
| Run all unit tests | `pnpm test` |
| Run tests for one plugin (CI) | `pnpm run test:<name>` (e.g. `test:favorites-manager`) |
| Run tests for one plugin (watch) | `pnpm run test:watch:<name>` |
| Lint | `pnpm run lint` |
| Lint with auto-fix | `pnpm run lint:fix` |
| Run Cypress e2e (one plugin) | `pnpm run e2e:run:<name>` |
| Open Cypress UI (one plugin) | `pnpm run e2e:open:<name>` |
| Regenerate package.json scripts | `pnpm run generate:scripts` |
| Clean dist/ | `pnpm run clean` |

The `<name>` in every script is the **package directory name**, e.g. `favorites-manager`, `index-db-cache`, `smart-views`.

Env vars come from a root `.env` file (loaded by `from-env` for `serve:*` and by `dotenv` in `test/config/base.config.ts` for e2e).

---

## Build Flow

### Full Build

```bash
pnpm run build            # run-s build:*
  └─ prebuild             → pnpm run clean  (rimraf dist/)
  └─ build:shared         → ng build shared          (ng-packagr)
  └─ build:energy-consumption-widget → ng build plugin.energy-consumption-widget
  └─ build:favorites-manager         → ng build plugin.favorites-manager
  └─ ...                  # one target per plugin, alphabetically
```

Each `ng build <plugin>` invokes `@c8y/devkit:build`, which:

1. Compiles the Angular application using the plugin's `tsconfig.app.json`.
2. Applies Module Federation (`buildTime.federation` in `cumulocity.config.ts`).
3. Copies configured assets.
4. Packages the output into a **ZIP file** under `dist/`.

### Post-build Artifact Renaming

`tools/build-rename.js` renames a ZIP output to include the version from the plugin's `package.json`:

```
dist/cumulocity-favorites-manager-plugin.zip
  → dist/cumulocity-favorites-manager-plugin_1.0.1.zip
```

Invoke it through the `_postbuild` shortcut, passing the package directory:

```bash
pnpm run _postbuild packages/favorites-manager
```

This is **not** wired into `pnpm run build` — no `postbuild:*` script calls it. The release workflow does its own versioned renaming inline, so in practice this tool is only for local one-off builds.

---

## Testing

### Unit Tests

Unit tests use **Karma + Jasmine** with the `@angular/build:karma` builder. All configuration is driven by `angular.json` test targets and the root `karma.conf.js`.

#### Configuration Layout

| File | Scope | Purpose |
|---|---|---|
| `karma.conf.js` | Root | Shared Karma config: Jasmine framework, Chrome launcher, coverage reporter, `ChromeHeadlessCI` custom launcher |
| `tsconfig.spec.json` | Per package | Extends root `tsconfig.json`; sets `types: ["jasmine", "node"]` |
| `angular.json` → `.architect.test` | Per project | Points to `@angular/build:karma`, references `karma.conf.js` and `tsconfig.spec.json` |

#### Running Tests

```bash
# Run all 11 suites in sequence (shared + 10 plugins):
pnpm test

# Run a single suite headless (CI mode):
pnpm run test:shared
pnpm run test:energy-consumption-widget
pnpm run test:favorites-manager
pnpm run test:index-db-cache
pnpm run test:kpi-widget
pnpm run test:layered-map-widget
pnpm run test:operations-widget
pnpm run test:release-notes
pnpm run test:reminder
pnpm run test:smart-views
pnpm run test:tenant-option-management

# Run a single suite in watch mode (development):
pnpm run test:watch:shared
pnpm run test:watch:favorites-manager
# ...

# Run via ng directly:
pnpm exec ng test plugin.kpi-widget --watch=false --browsers=ChromeHeadlessCI
```

The root `test` script chains **every** project that has a karma target, so a package registered in `angular.json` without at least one `*.spec.ts` file breaks `pnpm test` with `TS18003: No inputs were found in config file tsconfig.spec.json`. Add a spec alongside the package, or remove its `test` target.

#### ChromeHeadlessCI

The root `karma.conf.js` defines a `ChromeHeadlessCI` custom launcher:

```js
ChromeHeadlessCI: {
  base: 'ChromeHeadless',
  flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
}
```

Use `--browsers=ChromeHeadlessCI` in CI environments and `--browsers=ChromeHeadless` for local watch runs (watch scripts do this automatically).

### End-to-End Tests

E2E tests live in the `test/` pnpm workspace and use **Cypress** with the `cumulocity-cypress` library.

Required environment variables:

```bash
export C8Y_BASEURL=https://<your-tenant>.cumulocity.com
export C8Y_SHELL_TARGET=<app-name>         # e.g. cockpit2025
export C8Y_USERNAME=<username>
export C8Y_PASSWORD=<password>
export C8Y_TENANT=<tenant-id>              # optional for single-tenant
```

E2E runs are always **per plugin** — each plugin has its own Cypress config, because each needs its own Module Federation remote loaded into the shell:

```bash
pnpm run e2e:run:energy-consumption-widget
pnpm run e2e:run:favorites-manager
pnpm run e2e:run:index-db-cache
pnpm run e2e:run:kpi-widget
pnpm run e2e:run:layered-map-widget
pnpm run e2e:run:operations-widget
pnpm run e2e:run:release-notes
pnpm run e2e:run:reminder
pnpm run e2e:run:smart-views
pnpm run e2e:run:tenant-option-management

# Interactive runner (available for a subset of plugins):
pnpm run e2e:open:favorites-manager
pnpm run e2e:open:smart-views
```

The plugin must be served first — the specs load `http://localhost:9001` by default:

```bash
pnpm run serve:smart-views          # in one terminal
pnpm run e2e:run:smart-views        # in another
```

Cypress configs in `test/config/` import the corresponding `cumulocity.config.ts` from each package and pass `runTime.remotes` as the `C8Y_SHELL_EXTENSION` variable, so the correct Module Federation remotes are loaded automatically. They also pin an explicit `specPattern` so a config only ever runs its own plugin's spec.

Custom commands live in `test/cypress/support/commands.ts`. The two used by nearly every spec are `cy.getAuth().login()` and `cy.visitShellAndWaitForSelector(url, language, selector)` — the latter rewrites `url` to `/apps/<C8Y_SHELL_TARGET>/index.html#/<url>` and appends the remotes query parameter.

`testIsolation` is at the Cypress default (`true`), so cookies and local storage are cleared between tests. Log in from `beforeEach`, not `before`, in any spec with more than one `it`.

There is intentionally no "run every spec" script: the bare `e2e:run` / `e2e:open` scripts pass no `--config-file` and there is no default `cypress.config.ts` in `test/`, so they do not work as-is.

---

## Continuous Integration

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/pull-request.yml` | Pull request | Detects changed packages via `git diff` against `main` and runs lint → unit tests → build per changed package in a matrix. If root config files changed, an additional `verify-root-config` job runs `lint`, `pnpm test`, `pnpm run build` for the **whole** workspace and checks that the generated `package.json` scripts are up to date. |
| `.github/workflows/e2e-test.yml` | Pull request | Same change detection, then per changed package: `serve:<name>` on port 9001, `wait-on`, `e2e:run:<name>`. Screenshots are uploaded on failure. Requires the `e2e` GitHub environment for tenant credentials. |
| `.github/workflows/relase-after-tag.yml` | Tag push | Reads all projects from `angular.json`, builds each, and attaches versioned ZIPs to the release. |
| `.github/workflows/clank8y.yml` | Manual dispatch | Runs an AI review pass. |

Two consequences worth remembering, both because the matrix is derived from **directory names** under `packages/`:

- A package needs `serve:<dir>` and `e2e:run:<dir>` scripts, or its e2e job fails with a missing script.
- Never hand-edit the generated `package.json` scripts — `verify-root-config` re-runs the generator and fails on any diff.

Note that `shared` is explicitly excluded from the change-detection matrix (`grep -v '^shared$'`), so changes to it are only covered by the whole-workspace job.

---

## Script Generation

Plugin-specific `serve:*`, `build:*`, `test:*`, and `test:watch:*` scripts in the root `package.json` are **auto-generated** by `tools/generate-scripts.mts`. Re-run whenever a plugin is added to or removed from `angular.json`:

```bash
pnpm run generate:scripts
# internally: node --experimental-strip-types tools/generate-scripts.mts
```

The generator reads all projects from `angular.json`, where the short name is the part after `plugin.` (and therefore the directory name). For each project with a `@angular/build:karma` test target — `shared` included — it emits:

```json
"test:<short>":       "ng test plugin.<short> --watch=false --browsers=ChromeHeadlessCI",
"test:watch:<short>": "ng test plugin.<short> --browsers=ChromeHeadless"
```

The root `test` script (which chains all suites) is also regenerated automatically. Do **not** hand-edit the generated section of `package.json` — it is keyed by the `--generated----------` marker, overwritten on every run, and verified in CI.

The `e2e:*` scripts sit **above** the marker and are maintained by hand.

---

## Asset Generation

`tools/generate-assets.js` creates a typed `assets.ts` barrel from a folder of static assets:

```bash
node tools/generate-assets.js <folderPath>
```

It scans the directory recursively and generates `import` statements plus a nested `assets` object, giving type-safe access to asset paths throughout the plugin. If `<folder>/index.d.ts` declares specific module extensions, only those are picked up.

---

## Locale Conversion

Translations live per plugin in `src/locales/*.po`. `tools/convert-locales.js` walks the whole repository and converts any `*.locale.json` files it finds to `.po` (gettext) format:

```bash
pnpm run locales:convert
```

---

## Adding a New Plugin

1. Create `packages/<name>/` with `package.json`, `README.md`, `cumulocity.config.ts`, `.browserslistrc`, `tsconfig.app.json`, `tsconfig.json`, and `src/`.
2. Register the project in `angular.json` as `plugin.<name>` — the project name **must** match the directory name. Copy an existing entry and include all four architect targets; the `test` target uses `@angular/build:karma` and points at `karma.conf.js` and the package's `tsconfig.spec.json`.
3. Add `tsconfig.spec.json` — extend root `tsconfig.json`, set `types: ["jasmine", "node"]`.
4. Add at least one `*.spec.ts` under `src/`, otherwise `pnpm test` fails on the empty spec config (see [Unit Tests](#unit-tests)).
5. Run `pnpm run generate:scripts` to regenerate `build:*`, `serve:*`, `test:*`, `test:watch:*`, and the root `test` chain.
6. Add a Cypress config at `test/config/<name>.config.ts`, a spec at `test/cypress/e2e/<name>-plugin.cy.ts`, and `e2e:run:<name>` / `e2e:open:<name>` scripts (these are **not** generated). Without `e2e:run:<name>` the e2e workflow fails for any PR touching the package.

---

## Useful links

### 📘 Explore the Knowledge Base

Dive into Cumulocity tutorials and articles in the [TECHcommunity Knowledge Base](https://techcommunity.cumulocity.com/c/knowledge-base/7).

### 💡 Get Expert Answers

Ask the Cumulocity experts on the [TECHcommunity Forums](https://techcommunity.cumulocity.com/c/forum/5).

### 🚀 Try Cumulocity

See Cumulocity in action with a [Free Trial](https://techcommunity.cumulocity.com/t/cumulocity-iot-free-trial-faqs/1475).

### ✍️ Share Your Feedback

If you find a bug, please create an [issue](./issues). For ideas or feedback, post in the [Tech Forums](https://techcommunity.cumulocity.com/c/feedback-ideas/14).

### More to discover

- [Cumulocity IoT Web Development Tutorial – Part 1: Start your journey](https://techcommunity.cumulocity.com/t/cumulocity-iot-web-development-tutorial-part-1-start-your-journey/4124)
- [How to install a Microfrontend Plugin on a tenant and use it in an app?](https://techcommunity.cumulocity.com/t/how-to-install-a-microfrontend-plugin-on-a-tenant-and-use-it-in-an-app/3034)
- [The power of micro frontends – How to dynamically extend Cumulocity IoT Frontends](https://techcommunity.cumulocity.com/t/the-power-of-micro-frontends-how-to-dynamically-extend-cumulocity-iot-frontends/2577)

---

This toolkit is provided as-is and without warranty or support. It does not constitute part of the Cumulocity product suite. Users are free to use, fork and modify it, subject to the license agreement. While Cumulocity welcomes contributions, we cannot guarantee to include every contribution in the master project.
