# Cumulocity UI Guild Toolkit

<div align="center">

![Logo of the Cumulocity UI Guild, showing a medieval looking shield with the letters "U" and "I"](./public/ui-guild-banner.png)

</div>

---

This is a **pnpm monorepo** of Cumulocity IoT UI plugins built with **Angular 20** and the **Cumulocity Web SDK 1023.14.x**. All plugin projects are registered in a single root `angular.json` and share dependencies via pnpm workspaces. Shared logic lives in `packages/shared/`; individually deployable plugin packages live alongside it under `packages/`. Unit tests run with **Karma + Jasmine** via `@angular/build:karma`. End-to-end tests use **Cypress**.

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
│   │       ├── pipes/
│   │       └── services/
│   │
│   ├── energy-consumption-widget/
│   ├── favorites-manager/
│   ├── kpi-widget/
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   └── tenant-option-management/
│
├── test/                     # Cypress E2E suite (separate pnpm workspace)
│   ├── cypress/e2e/          # One spec file per plugin
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
- `test/` is a **separate** workspace containing the Cypress suite — run `pnpm install` inside `test/` independently when needed.
- `.npmrc` sets `shamefully-hoist=true`, which hoists all packages to the root `node_modules/`. This is required for Angular's build tooling and the Cumulocity devkit to resolve peer dependencies.
- `.pnpmfile.cjs` overrides the TypeScript version resolved by `@c8y/devkit` to match the workspace version (5.9.x), preventing a `@ngtools/webpack` Debug Failure at build time.

---

## Angular Workspace

All plugins are registered as Angular projects in the single root `angular.json`. Projects follow the naming convention `plugin.<short-name>` (e.g. `plugin.favorites`, `plugin.kpi-widget`).

| Angular project              | Package directory              |
| ---------------------------- | ------------------------------ |
| `shared`                     | `packages/shared`              |
| `plugin.energy-consumption-widget` | `packages/energy-consumption-widget` |
| `plugin.favorites`           | `packages/favorites-manager`   |
| `plugin.kpi-widget`          | `packages/kpi-widget`          |
| `plugin.operations-widget`   | `packages/operations-widget`   |
| `plugin.release-notes`       | `packages/release-notes`       |
| `plugin.reminder`            | `packages/reminder`            |
| `plugin.tenant-option-management` | `packages/tenant-option-management` |

Each plugin project defines four architect targets:

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
├── cumulocity.config.ts    # Cumulocity runtime + build-time config (Module Federation, exports)
├── tsconfig.app.json       # Extends root tsconfig.json (Angular build)
├── tsconfig.json           # Extends root tsconfig.json
├── tsconfig.spec.json      # Extends root tsconfig.json (types: jasmine, node)
├── src/
│   ├── main.ts             # Angular bootstrap entry point
│   ├── bootstrap.ts        # Locale + app bootstrap
│   ├── app/                # Angular application code
│   └── assets/             # Static assets
└── public/                 # Additional public assets (some plugins)
```

### Standalone Components

All components and pipes in this workspace are `standalone: true`. There are no NgModules. Plugin entrypoints export **provider arrays** (e.g. `EnergyConsumptionWidgetPluginProviders`) instead of `@NgModule` classes. These provider arrays are consumed directly by the Cumulocity shell's Module Federation loader.

### `cumulocity.config.ts`

The key Cumulocity-specific config for each plugin. It contains:

- **`runTime`**: Plugin metadata for the shell — name, version, CSP, and `exports` / `remotes` for Module Federation. The `module` field in each export entry names the provider array exported from the `path` file.
- **`buildTime`**: Lists packages to federate (shared from the shell, not re-bundled), and asset copy rules.

Widget definitions use `hookWidget` with `loadComponent` / `loadConfigComponent` for lazy loading. Route hooks use `hookRoute` with `loadComponent`. Drawer and action hooks use static `component` references (SDK constraint).

---

## Shared Library (`packages/shared/`)

The `shared` package is a proper workspace library consumed by every plugin:

```json
"dependencies": {
  "shared": "workspace:*"
}
```

It is built with **ng-packagr** (`ng build shared`) to produce an FESM2022 library with TypeScript declarations. Output goes to `packages/shared/dist/`.

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
| `src/helpers/`    | Type utilities, domain model helpers, test auto-mock helpers            |
| `src/pipes/`      | Angular pipes (file size, filter, sort, nl2br, replace, etc.)           |
| `src/services/`   | Angular services (local storage, measurements, etc.)                    |

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
| Run tests for one plugin (CI) | `pnpm run test:<name>` (e.g. `test:favorites`) |
| Run tests for one plugin (watch) | `pnpm run test:watch:<name>` |
| Lint | `pnpm run lint` |
| Lint with auto-fix | `pnpm run lint:fix` |
| Run Cypress e2e (all) | `pnpm run e2e:run` |
| Run Cypress e2e (one plugin) | `pnpm run e2e:run:<name>` |
| Open Cypress UI | `pnpm run e2e:open` |
| Regenerate package.json scripts | `pnpm run generate:scripts` |
| Clean dist/ | `pnpm run clean` |

---

## Build Flow

### Full Build

```bash
pnpm run build
  └─ prebuild            → pnpm run clean  (rimraf dist/)
  └─ build:reminder      → ng build plugin.reminder
  └─ build:kpi-widget    → ng build plugin.kpi-widget
  └─ ...
```

Each `ng build <plugin>` invokes `@c8y/devkit:build`, which:

1. Compiles the Angular application using the plugin's `tsconfig.app.json`.
2. Applies Module Federation (`buildTime.federation` in `cumulocity.config.ts`).
3. Copies configured assets.
4. Packages the output into a **ZIP file** under `dist/`.

### Post-build Artifact Renaming

`tools/postbuild.js` and `tools/build-rename.js` rename ZIP outputs to include the version from the plugin's `package.json`:

```
dist/cumulocity-favorites-manager-plugin.zip
  → dist/cumulocity-favorites-manager-plugin_1.0.1.zip
```

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
# Run all 8 suites in sequence (76 tests):
pnpm test

# Run a single suite headless (CI mode):
pnpm run test:shared
pnpm run test:energy-consumption-widget
pnpm run test:favorites
pnpm run test:kpi-widget
pnpm run test:operations-widget
pnpm run test:release-notes
pnpm run test:reminder
pnpm run test:tenant-option-management

# Run a single suite in watch mode (development):
pnpm run test:watch:shared
pnpm run test:watch:favorites
# ...

# Run via ng directly:
pnpm exec ng test plugin.kpi-widget --watch=false --browsers=ChromeHeadlessCI
```

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

```bash
# Run all E2E specs:
pnpm run e2e:run

# Run per plugin:
pnpm run e2e:run:favorites-manager
pnpm run e2e:run:kpi-widget
pnpm run e2e:run:energy-consumption-widget
pnpm run e2e:run:operations-widget
pnpm run e2e:run:release-notes
pnpm run e2e:run:reminder
pnpm run e2e:run:tenant-option-management

# Open Cypress interactive runner:
pnpm run e2e:open
pnpm run e2e:open:favorites-manager
```

Cypress configs in `test/config/` import the corresponding `cumulocity.config.ts` from each package and pass `runTime.remotes` as the `C8Y_SHELL_EXTENSION` variable, so the correct Module Federation remotes are loaded automatically.

---

## Script Generation

Plugin-specific `serve:*`, `build:*`, `test:*`, and `test:watch:*` scripts in the root `package.json` are **auto-generated** by `tools/generate-scripts.mts`. Re-run whenever a plugin is added to or removed from `angular.json`:

```bash
pnpm run generate:scripts
# internally: node --experimental-strip-types tools/generate-scripts.mts
```

The generator reads all projects from `angular.json`. For each `plugin.<short>` project that has a `@angular/build:karma` test target it emits:

```json
"test:<short>":       "ng test plugin.<short> --watch=false --browsers=ChromeHeadlessCI",
"test:watch:<short>": "ng test plugin.<short> --browsers=ChromeHeadless"
```

The root `test` script (which chains all suites) is also regenerated automatically. Do **not** hand-edit the generated section of `package.json` — it is keyed by the `--generated----------` marker and overwritten on every run.

---

## Asset Generation

`tools/generate-assets.js` creates a typed `assets.ts` barrel from a folder of static assets:

```bash
node tools/generate-assets.js <folderPath>
```

It scans the directory recursively and generates `import` statements plus a nested `assets` object, giving type-safe access to asset paths throughout the plugin.

---

## Adding a New Plugin

1. Create `packages/<name>/` with `package.json`, `cumulocity.config.ts`, `tsconfig.app.json`, `tsconfig.json`, and `src/`.
2. Register the project in `angular.json` as `plugin.<name>` following the existing patterns. Include a `test` architect target using `@angular/build:karma` and pointing to `karma.conf.js` and the package's `tsconfig.spec.json`.
3. Add `tsconfig.spec.json` — extend root `tsconfig.json`, set `types: ["jasmine", "node"]`.
4. Run `pnpm run generate:scripts` to regenerate `build:*`, `serve:*`, `test:*`, and `test:watch:*` scripts.
5. Optionally add a Cypress config to `test/config/<name>.config.ts` and an `e2e:run:<name>` script.

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
