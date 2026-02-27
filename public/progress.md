# UI Guild Progress

## Goals 2025:

| Task | Owner(s) | Progress |
|------|----------|----------|
| Create/ configure mono repo | Dirk | 100% |
| Add Cypress test setup | Hendrik, Dirk, Christian | 100% |
| Add unit tests for shared libs | - | 0% |
| Add basic Cypress tests per package | Various | 12% (1/8) |
| Add linting setup, apply linting | Dirk, Hendrik, Christian | 100% |
| Add CI/CD | Christian, Dirk | 100% |
| Add as much plugins/ widgets as possible | Christian, Dirk, Divya, Felix, Vignesh | 42% (8/19) |
| Publish repository | - | 100% |


## Contributions 2025:

This document summarizes all commits in the repository, categorizing them by package or shared library, and describing what was improved. Each entry includes the commit message, author, and a brief description of the change.

---

### Packages

#### 1. energy-consumption-widget
- **Author:** Dirk Peter
- **Key Commits:**
  - *Initial implementation and TODOs* ([465dcdc](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/465dcdc9))
    - Added widget for displaying energy consumption, with plans for time-based and quota-based views.
  - *Selectable daterange, unit on axis* ([a837b9d](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/a837b9d2))
    - Added selectable date range and discussed unit display on axis.

#### 2. favorites-manager
- **Author:** Christian Guether
- **Key Commits:**
  - *Add Favorites Manager Plugin* ([0593362](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/05933628))
    - Introduced plugin to manage user favorites, including filtering and SSO notes.
  - *Fix test for favorites manager* ([595fe0a](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/595fe0a))
    - Fixed test issues for the plugin.

#### 3. kpi-widget
- **Author:** Dirk Peter
- **Key Commits:**
  - *Initial implementation* ([122706d](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/122706d0))
    - Added KPI aggregator widget with bar, pie, and table display modes.
  - *Updates and fixes* ([3050431](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/3050431))
    - Improved KPI inject and constant usage.

#### 4. operations-widget
- **Author:** Dirk Peter, Vignesh Babu, Hendrik Naether
- **Key Commits:**
  - *Initial implementation* ([2d57907](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/2d57907c))
    - Added widget for sending operations from Cockpit, with configurable buttons and parameters.
  - *Extended* widget* to support dynamic paramters 

#### 5. release-notes
- **Author:** Dirk Peter
- **Key Commits:**
  - *Initial implementation* ([88190be](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/88190be9))
    - Added plugin for creating and viewing release notes, with admin and user views.

#### 6. reminder
- **Author:** Dirk Peter
- **Key Commits:**
  - *Initial implementation* ([122706d](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/122706d0))
    - Added critical alarm reminder plugin, with manual setup and notification options.
  - *Reminder date selection fix* ([58fea90](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/58fea90))
    - Fixed date selection functionality.

#### 7. tenant-option-management
- **Authors:** Christian Guether, Hendrik Näther
- **Key Commits:**
  - *Add tenant option management plugin* ([a0b1c2f](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/a0b1c2fb))
    - Added plugin for managing tenant options, including encryption and JSON support.
  - *Feature/tenant options fixes* ([e1eaefe](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/e1eaefe7))
    - Updated for UI v. 1021 compatibility.
    - 
---

### Shared Libraries (libs/components, helpers, pipes, services)

#### libs/components
- **Authors:** Hendrik Näther, Harald Meyer, Dirk Peter, Vignesh Babu
- **Key Commits:**
  - *Added alarm icon, auto refresh, device selector modal, image upload, image gallery, heatmap, dynamic forms* ([d3370b0](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/d3370b0f), [97e484a](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/97e484ad), [2600d04](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/2600d04d), [10a81c9](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/10a81c9d))
    - Introduced reusable UI components with documentation and usage examples.

#### libs/helpers, libs/pipes, libs/services
- **Authors:** Various
- **Key Commits:**
  - *Added helpers, pipes, and services* ([7bd688b](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/7bd688b), [5a7e6a3](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/5a7e6a3), [e6fcbb3](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/e6fcbb3))
    - Added utility functions, pipes for formatting, and shared services for use across packages.

---

### General Improvements
- **Initial monorepo setup**
  - **Authors:** Dirk Peter
- **Cypress setup**
  - **Authors:** Hendrik Näther, Christian Güther, Dirk Peter
  - Initital test setup
  - Added Cypress tests
- **CI/CD & Workflow:**
  - **Authors:** Christian Güther, Dirk Peter
  - Improved build scripts, release workflows, and E2E test runners ([b7d6865](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/b7d6865), [90de21e](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/90de21e)).
- **Linting & Code Quality:**
  - **Authors:** Dirk Peter
  - Addressed linting issues and improved code consistency ([d8a1097](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/d8a1097), [9f7e6a1](https://github.com/Cumulocity-IoT/cumulocity-ui-toolkit/commit/9f7e6a1)).

---

*This summary was generated based on commit messages, code changes, and file authorship. For full details, see the commit history on GitHub.*

### Non toolkit improvements

#### 1. new indoor-map-widget
- **Authors:** Felix Lange
- **Key Commits:**
- Added features (https://github.com/Cumulocity-IoT/cumulocity-indoor-map-plugin)

#### 2. layered-map-widget
- **Authors:** Felix Lange
- **Key Commits:**
- Bugfixes + Version update (https://github.com/Cumulocity-IoT/cumulocity-indoor-map-plugin)

### 3. Tech community article
- **Authors:** Felix Lange
- https://community.cumulocity.com/t/transforming-indoor-asset-tracking-with-the-cumulocity-indoor-map-plugin/14203

### 4. Advanced data simulator (not yet published)
- **Authors:** Felix Lange
- Microservice to configure complex simulators via tenant options 

# Goals 2026:

| Goal |
|------|
| Optimizations for all packages (e.g. lazy loading, less dependencies, standalone: true) |
| Create release for 2025-lts |
| Migrate to 2026-lts (1023.14.x) |
| Create at least one release for 2026-lts |
| Add basic Cypress tests for all packages |  
| Automatic WebSDK compatibility pipeline |
| Automatic release trigger | 
| Publish repository | 
| GitHub page, TechCommunity article for Plugins and Lib |
| Change setup to pnpm |
| Contribute to c8y-skills |
| AI research | 
| Incorporate AI into CI/CD workflow |
