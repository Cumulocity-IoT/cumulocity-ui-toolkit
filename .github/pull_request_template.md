<!-- Adapted from the @cumulocity-iot/ui-sdk app template: what a reviewer needs to approve without rebuilding the
     change in their head. A coding agent fills it with the reviewing-code-quality skill (hand over). Delete what does
     not apply; a section that does not apply can say so in one line. -->

## What and why

<!-- One or two sentences: the user-visible change and the reason. One topic per pull request. -->

## Risk

<!-- `pnpm exec c8y-ui review risk --base origin/main`: the level, the size and the high and medium reasons. CI prints
     the same on the summary page of the "Review the change" job. -->

## Read first

<!-- The two or three files or decisions that carry the risk, in the order to read them. Everything else follows from them. -->

## Evidence

<!-- Run on the last commit of this branch. A check that did not run is listed under "Not verified". -->

- [ ] `pnpm run lint` (errors: 0, warnings in changed files: )
- [ ] `pnpm run test:<plugin>` (specs: , passed: )
- [ ] `pnpm run build:<plugin>`
- [ ] `pnpm run e2e:mock <plugin>` (specs: , passed: )
- [ ] `pnpm exec c8y-ui fallow audit --base origin/main`
- Requests the mock could not answer (the e2e job's summary page):
- Views that should look different (CI compares the specs' `reviewScreenshot()` views with `main` and lists the ones
  that do, on the e2e job's summary page):
- Changelog: `packages/<plugin>/CHANGELOG.md` and/or the root `CHANGELOG.md` (AGENTS.md → Changelogs)

## Not verified

<!-- What the mock cannot show and nobody checked on a tenant: permissions and roles, real data volumes, fragments of
     real devices, other Web SDK versions, branding. "Nothing" is an answer too, if it is true. -->

## Responsible

<!-- The person who read the whole diff and answers for it, also when an agent wrote it. -->
