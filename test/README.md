# E2E tests

Playwright specs for every plugin in `packages/`, run against the `@cumulocity-iot/ui-sdk` tenant mock (an emulated
tenant with the windy-dev world and the real cockpit build). No tenant, no credentials.

```bash
pnpm install                           # once (root: the plugins and this workspace)
pnpm run e2e:install                   # once: the Chromium build
pnpm run e2e:mock <plugin>             # e.g. pnpm run e2e:mock reminder
pnpm run e2e:mock <plugin> --open      # Playwright UI mode
pnpm run e2e:mock <plugin> --headed --spec=<filter>
pnpm run e2e:mock <plugin> --frozen    # clock frozen: the review screenshots in review-screenshots/<plugin>/
```

The first run pulls `mock/windy-dev.json` from windy-dev through go-c8y-cli (`pnpm run e2e:world:pull`; a session or
`C8Y_HOST` / `C8Y_USER` / `C8Y_PASSWORD`). Everything else, including how to write a spec, is in `AGENTS.md`.
