# Cumulocity UI Guild Toolkit

<div align="center">

![Logo of the Cumulocity UI Guild, showing an medival looking shield with the letters "U" and "I"](./public/ui-guild-banner.png)

</div>

---

This is a **monorepo** for Cumulocity IoT UI plugins built with Angular 18. It is managed via a single root `package.json` and a single `angular.json` that registers all plugin projects. Shared logic lives under `packages/shared/`, while individually deployable plugin packages live alongside it in `packages/`. The workspace is managed by **pnpm**.

---

## Directory Structure

```
cumulocity-ui-toolkit/
├── angular.json              # Single Angular workspace config (all plugins registered here)
├── package.json              # Root package.json – scripts, shared dependencies
├── pnpm-workspace.yaml       # pnpm workspace config
├── .npmrc                    # pnpm config: shamefully-hoist=true
├── tsconfig.json             # Root TypeScript config with path aliases for shared/
├── jest.config.ts            # Root Jest config – orchestrates all package Jest projects
├── setup-jest.ts             # Global Jest setup (Angular TestBed environment + Web Streams polyfills)
├── eslint.config.mjs         # Shared ESLint config
│
├── packages/                 # All workspace packages
│   ├── shared/               # Shared internal library (components, pipes, services, helpers)
│   │   ├── package.json      # name: "shared", built with tsdown
│   │   ├── tsconfig.json
│   │   ├── tsconfig.spec.json # Jest TypeScript config for shared unit tests
│   │   ├── jest.config.cjs   # CJS format (required by "type":"module" in package.json)
│   │   ├── tsdown.config.ts  # tsdown build config
│   │   └── src/
│   │       ├── index.ts      # Barrel export
│   │       ├── components/
│   │       ├── helpers/
│   │       ├── pipes/
│   │       └── services/
│   │
│   ├── energy-consumption-widget/
│   ├── favorites-manager/
│   ├── kpi-widget/
│   ├── layered-map/
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   └── tenant-option-management/
│
├── test/                     # Cypress end-to-end tests (separate pnpm workspace)
│
└── tools/                    # Node.js build utility scripts
    ├── generate-scripts.js   # Auto-generates package.json scripts from angular.json plugins
    ├── generate-assets.js    # Generates a typed assets.ts barrel file from asset folders
    ├── postbuild.js          # Orchestrates post-build steps (calls build-rename.js)
    └── build-rename.js       # Renames build ZIP archives to include the version number
```

---

## pnpm Workspace

The workspace is configured via `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'test'
```

- Every directory under `packages/` is a pnpm workspace package, including `shared`.
- The `test/` directory is a separate workspace with the Cypress E2E suite.
- The root `package.json` no longer contains an npm `"workspaces"` field; pnpm uses `pnpm-workspace.yaml` instead.

### `.npmrc`

```
shamefully-hoist=true
```

This hoists all packages to the root `node_modules/`, which is required for Angular's build tools and the Cumulocity devkit to locate peer dependencies correctly.

---

## Angular Workspace

All plugins are registered as **Angular projects** in the single root `angular.json`. Each project is named using the convention `plugin.<short-name>` (e.g. `plugin.favorites`, `plugin.kpi-widget`).

Each plugin project defines three architect targets:

| Target   | Builder                  | Purpose                                                  |
| -------- | ------------------------ | -------------------------------------------------------- |
| `build`  | `@c8y/devkit:build`      | Produces a deployable ZIP artifact in `dist/`            |
| `serve`  | `@c8y/devkit:dev-server` | Local development server with live reload                |
| `deploy` | `@c8y/devkit:deploy`     | Deploys the built plugin directly to a Cumulocity tenant |

**Default build configuration** is `production`. The `development` configuration disables optimization and enables source maps.

> Note: There is no `test` architect target in `angular.json`. Unit tests are run directly via package scripts (see [Testing](#testing) below).

---

## Plugin Package Structure

Each plugin under `packages/<name>/` follows this structure:

```
packages/<name>/
├── package.json            # Plugin name + version; declares "shared": "workspace:*" dependency
├── cumulocity.config.ts    # Cumulocity runtime + build-time config (federation, exports, etc.)
├── tsconfig.app.json       # Extends root tsconfig.json (for Angular build)
├── tsconfig.spec.json      # Extends root tsconfig.json (for Jest, sets module: CommonJS)
├── jest.config.ts          # Per-package Jest config (preset, transform, moduleNameMapper)
├── src/
│   ├── main.ts             # Angular bootstrap entry point
│   ├── app/                # Angular application code
│   └── assets/             # Static assets
└── public/                 # Additional public assets (some plugins)
```

### `cumulocity.config.ts`

This file is the key Cumulocity-specific config for each plugin. It contains:

- **`runTime`**: Describes the plugin to the Cumulocity shell (name, version, context path, CSP, `exports` for Module Federation remotes).
- **`buildTime`**: Lists packages to federate (shared from the shell, not bundled), and asset copy rules.

Module Federation is used to load plugins dynamically into the Cumulocity shell without re-bundling shared dependencies like `@angular/core` or `@c8y/ngx-components`.

---

## Shared Library (`packages/shared/`)

The `shared` package replaces what was previously the `libs/` folder. It is a proper pnpm workspace package declared as a dependency in every plugin:

```json
"dependencies": {
  "shared": "workspace:*"
}
```

### TypeScript Path Aliases

The shared package is consumed by Angular plugins via TypeScript path aliases defined in the root `tsconfig.json`:

```json
"paths": {
  "~components/*": ["./packages/shared/src/components/*"],
  "~helpers/*":    ["./packages/shared/src/helpers/*"],
  "~models/*":     ["./packages/shared/src/models/*"],
  "~pipes/*":      ["./packages/shared/src/pipes/*"],
  "~services/*":   ["./packages/shared/src/services/*"]
}
```

Any plugin can import shared code using these aliases:

```typescript
import { LocalStorageService } from '~services/local-storage.service';
import { extractPlaceholdersFromObject } from '~helpers/extract-placeholders';
```

### tsdown Build

The shared package is built with **tsdown** (based on rolldown/esbuild) to produce a distributable library:

```bash
pnpm --filter shared run build
```

- Entry: `src/index.ts`
- Output formats: ESM + CJS with TypeScript declarations
- Angular/Cumulocity/rxjs packages are externalized (not bundled)

| Folder            | Contents                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- |
| `src/components/` | Reusable Angular components (alarm icon, heatmap, image gallery, device selector, etc.) |
| `src/helpers/`    | Type utilities, domain model helpers, test auto-mock helpers                            |
| `src/pipes/`      | Angular pipes (file size, filter, sort, nl2br, replace, etc.)                           |
| `src/services/`   | Angular services (data grid, local storage, measurements, operations, etc.)             |

---

## Build Flow

### Full Build

Running `pnpm run build` at the root level executes `run-s build:*` (sequential via `npm-run-all`), which builds every plugin in sequence:

```
pnpm run build
  └─ prebuild        → pnpm run clean  (rimraf dist/)
  └─ build:reminder  → ng build plugin.reminder
  └─ build:kpi-widget → ng build plugin.kpi-widget
  └─ build:release-notes → ng build plugin.release-notes
  └─ ... (all plugins)
```

Each `ng build <plugin>` invokes `@c8y/devkit:build`, which:

1. Compiles the Angular application using the plugin's `tsconfig.app.json`.
2. Applies Module Federation (via `buildTime.federation` in `cumulocity.config.ts`).
3. Copies configured assets.
4. Packages the output into a **ZIP file** at `dist/<output-path-name>.zip`.

### Individual Plugin Build

```bash
pnpm run build:favorites       # ng build plugin.favorites
pnpm run build:kpi-widget      # ng build plugin.kpi-widget
```

### Post-build Artifact Renaming

The `tools/postbuild.js` and `tools/build-rename.js` scripts rename build output files to include the version from the package's `package.json`:

```
dist/cumulocity-favorites-manager-plugin.zip
  → dist/cumulocity-favorites-manager-plugin_1.0.1.zip
```

---

## Script Generation

Plugin-specific `serve:*`, `build:*`, and `test:*` scripts in the root `package.json` are **auto-generated** by `tools/generate-scripts.js`. Re-run whenever a new plugin project is added to `angular.json`:

```bash
node tools/generate-scripts.js
```

It reads all `plugin.*` projects from `angular.json` and writes corresponding scripts. For each plugin `plugin.<short>`:

```json
"serve:<short>":  "pnpm run _serve plugin.<short>",
"build:<short>":  "ng build plugin.<short>",
"test:<short>":   "pnpm --filter <packageName> run test"   ← only if the plugin has a test script
```

The `test:*` script is only generated if the plugin's `package.json` has a `"test"` script entry.

---

## Asset Generation

`tools/generate-assets.js` is a code-generation utility used to create a typed `assets.ts` barrel file from a folder of static assets:

```bash
node tools/generate-assets.js <folderPath>
```

It scans the directory recursively, generates TypeScript `import` statements for each file, and exports a nested `assets` object giving type-safe access to asset paths throughout the plugin.

---

## Testing

### Unit Tests

All unit tests — in Angular plugin packages and in the pure-TypeScript `shared` package — run via **Jest** with [`jest-preset-angular`](https://thymikee.github.io/jest-preset-angular/).

#### Configuration Layout

| File                                 | Scope               | Purpose                                                                                                        |
| ------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `jest.config.ts`                     | Root                | Delegates to every package via `projects: ['<rootDir>/packages/*']`                                            |
| `setup-jest.ts`                      | Root                | Calls `setupZoneTestEnv()` (Angular `TestBed` init) and polyfills Web Streams API for jsdom                    |
| `packages/<name>/jest.config.ts`     | Per Angular package | `jest-preset-angular` preset, `moduleNameMapper` for `~helpers/*` etc., `transformIgnorePatterns` for ESM deps |
| `packages/<name>/tsconfig.spec.json` | Per package         | Extends root tsconfig; overrides `module` to `CommonJS` for Jest compatibility                                 |
| `packages/shared/jest.config.cjs`    | shared package      | CJS format required because `shared/package.json` has `"type": "module"`                                       |
| `packages/shared/tsconfig.spec.json` | shared package      | Same as Angular packages                                                                                       |

#### Key Configuration Details

**ESM dependencies** — Angular, `@c8y/ngx-components`, `ngx-bootstrap`, and `lodash-es` all ship ESM-only builds. Jest runs in CommonJS mode by default, so the `transform` and `transformIgnorePatterns` options in each package config ensure these are compiled by `jest-preset-angular`:

```typescript
transform: {
  '^.+\\.(ts|mjs|js|html)$': ['jest-preset-angular', { tsconfig: '<rootDir>/tsconfig.spec.json', diagnostics: false }],
},
transformIgnorePatterns: ['/node_modules/(?!.*(lodash-es|\\.mjs))'],
```

**Shared library imports** — Angular plugins import shared code via TypeScript path aliases (`~helpers/*`, `~services/*`, etc.). The `moduleNameMapper` in each package's Jest config maps these to the raw TypeScript source, bypassing the `tsdown` build output:

```typescript
moduleNameMapper: {
  '^~helpers/(.*)$': '<rootDir>/../shared/src/helpers/$1',
  '^~services/(.*)$': '<rootDir>/../shared/src/services/$1',
  '^shared$': '<rootDir>/../shared/src/index.ts',
  // ...
},
```

#### Running Tests

```bash
# Run all tests from the root:
pnpm run test

# Run tests for a specific plugin:
pnpm run test:favorites
pnpm run test:reminder
pnpm run test:operations-widget
pnpm run test:tenant-option-management

# Run Jest directly for a single package:
pnpm exec jest --config packages/favorites-manager/jest.config.ts

# Run tests inside every package independently (no root orchestration):
pnpm run test:packages
```

Plugins with spec files: `favorites-manager`, `reminder`, `operations-widget`, `tenant-option-management`, `shared`.

Packages without spec files (`kpi-widget`, `energy-consumption-widget`, `release-notes`, `layered-map`) have Jest configs with `passWithNoTests: true` so the root run doesn't fail.

### End-to-End Tests

E2E tests live in the `test/` pnpm workspace and use **Cypress** with the `cumulocity-cypress` library.

```bash
pnpm run e2e:run:favorites-manager
pnpm run e2e:run:kpi-widget
pnpm run e2e:run:operations-widget
```

Cypress is invoked via `pnpm -C test exec -- cypress ...` which runs commands inside the `test/` directory.

---

## Adding a New Plugin

1. Create the plugin directory under `packages/<name>/` with `package.json` (include `"shared": "workspace:*"` in dependencies), `cumulocity.config.ts`, `tsconfig.app.json`, and `src/`.
2. Register the project in `angular.json` as `plugin.<name>` following the existing patterns.
3. Run `node tools/generate-scripts.js` to regenerate `serve:*`, `build:*` (and `test:*` if applicable) scripts.
4. Add `tsconfig.spec.json` and `jest.config.ts` (copy from an existing plugin and update `displayName`). Add `"test": "jest"` to the plugin's `package.json` to enable unit tests via the root orchestration.
5. (Optional) Add a Cypress config to `test/config/` and an `e2e:run:<name>` script to the root `package.json`.

## Useful links

### 📘 Explore the Knowledge Base

Dive into a wealth of Cumulocity tutorials and articles in the [TECHcommunity Knowledge Base](https://techcommunity.cumulocity.com/c/knowledge-base/7).

### 💡 Get Expert Answers

Stuck or just curious? Ask the Cumulocity experts directly on our [Cumulocity TECHcommunity Forums](https://techcommunity.cumulocity.com/c/forum/5).

### 🚀 Try Cumulocity

See Cumulocity in action with a [Free Trial](https://techcommunity.cumulocity.com/t/cumulocity-iot-free-trial-faqs/1475).

### ✍️ Share Your Feedback

Your input drives our innovation. If you find a bug, please create an [issue](./issues) in the repository. If you’d like to share your ideas or feedback, please post them in our [Tech Forums](https://techcommunity.cumulocity.com/c/feedback-ideas/14).

### More to discover

- [Cumulocity IoT Web Development Tutorial - Part 1: Start your journey](https://techcommunity.cumulocity.com/t/cumulocity-iot-web-development-tutorial-part-1-start-your-journey/4124)
- [How to install a Microfrontend Plugin on a tenant and use it in an app?](https://techcommunity.cumulocity.com/t/how-to-install-a-microfrontend-plugin-on-a-tenant-and-use-it-in-an-app/3034)
- [The power of micro frontends – How to dynamically extend Cumulocity IoT Frontends](https://techcommunity.cumulocity.com/t/the-power-of-micro-frontends-how-to-dynamically-extend-cumulocity-iot-frontends/2577)

---

This widget is provided as-is and without warranty or support. They do not constitute part of the Cumulocity product suite. Users are free to use, fork and modify them, subject to the license agreement. While Cumulocity welcomes contributions, we cannot guarantee to include every contribution in the master project.
