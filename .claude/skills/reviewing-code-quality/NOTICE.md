# Notice

This skill is adapted from `skills/code-quality-analysis` in
[Cumulocity-IoT/cumulocity-skills-community](https://github.com/Cumulocity-IoT/cumulocity-skills-community),
licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).

## Main changes

- Renamed to `reviewing-code-quality` and framed as step 4 (REVIEW) of the `@cumulocity-iot/ui-sdk` workflow, next to
  `creating-apps`, `building-mock-worlds`, `developing-ui` and `writing-e2e-tests`.
- Frontmatter reduced to `name` and `description`; `version`, `category`, `triggers` and `tags` removed.
- Split into a short workflow (`SKILL.md`) and the catalogue (`references/anti-patterns.md`).
- Removed the dependency on the external `mastering-typescript` skill, the `fetch_webpage` of angular.dev
  `llms-full.txt`, the version-specific angular.dev style-guide links and the hosted `c8y-docs` MCP
  (`mcp_c8y-docs_*` tools). Lookups now go to the local `c8y-web-sdk-knowledge` MCP (`search_concept`, `get_node`,
  `find_usage`, `resolve_symbol`) and the installed Angular type declarations.
- Workflow: scope defaults to changed files (git diff) instead of every file; one findings table (file:line, id,
  severity, snippet, fix); fixes only on request, verified with `pnpm exec ng build` and `pnpm e2e`.
- Catalogue AP-01 … AP-23 kept in substance and tightened. Every entry now has a severity and a detect hint
  (grep pattern or what to look for).
- Updated for Angular 21: control-flow directives deprecated (AP-01); `@for` requires `track`, so AP-05 targets weak
  track expressions; standalone is the default and `standalone: true` is redundant (AP-06, AP-08); `toSignal()` and
  `takeUntilDestroyed()` without arguments (AP-09); `protected` for template-only members per the current Angular
  style guide (AP-21).
- AP-19 (secrets) merged with the project-specific check for tenant URLs, credentials and tenant ids; examples use
  the mock (`c8y-ui dev`) instead of `c8ycli server` with credentials.
- AP-22: example issue link replaced with a placeholder.
- Added AP-24 (loosened supply-chain settings in `pnpm-workspace.yaml`, `@c8y/*` versions drifting from
  `c8y-ui.json`) and AP-25 (test or demo data in code or Cypress intercepts instead of `mock/world.json`).
