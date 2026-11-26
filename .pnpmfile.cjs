// License check before a dependency is installed, from @cumulocity-iot/ui-sdk. pnpm calls this hook after it resolved
// the versions and before it downloads one: a dependency that is new in the lockfile and declares a license the app
// does not allow (c8y-ui.json → licenses) stops `pnpm add` or the update, and nothing is installed. The newest release
// of the version's minor and major is read too, because a license change often arrives one release before the
// `license` field says so. The whole installed tree is checked by `pnpm licenses:check` and the Security workflow.
// In a monorepo this file sits at the workspace root, each app is checked against its own c8y-ui.json.
// pnpm records this file's checksum in pnpm-lock.yaml: after a change here, run `pnpm install` and commit the lockfile.
const { existsSync } = require('node:fs')
const { createRequire } = require('node:module')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

module.exports = {
  hooks: {
    async afterAllResolved(lockfile, context) {
      // The SDK as installed at the root or in one of the apps (pnpm does not hoist an app's dependency to the root).
      for (const dir of ['.', ...Object.keys(lockfile.importers ?? {})]) {
        let licenses
        try {
          licenses = createRequire(join(__dirname, dir, 'package.json')).resolve('@cumulocity-iot/ui-sdk/licenses')
        }
        catch {
          continue
        }
        await (await import(pathToFileURL(licenses).href)).checkResolved(lockfile, { root: __dirname, log: context.log })
        return lockfile
      }
      // The first install of a clone and a Dependabot run have no SDK yet; CI checks what they install. An SDK from
      // before the license check has no `licenses` entry point either.
      if (existsSync(join(__dirname, 'node_modules')))
        context.log('license check skipped: @cumulocity-iot/ui-sdk is not installed, or older than its license check (upgrade it); pnpm exec c8y-ui licenses checks after the install')
      return lockfile
    },
  },
}
