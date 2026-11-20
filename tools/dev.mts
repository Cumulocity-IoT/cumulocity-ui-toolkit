// Local dev with hot reload on the tenant mock (cockpit of the workspace's Web SDK version + the windy-dev world from
// test/mock, no login): `c8y-ui dev --apps` of @cumulocity-iot/ui-sdk — one Vite server per plugin behind a router.
//
//   pnpm run dev                      # all plugins
//   pnpm run dev reminder kpi-widget  # only these (package folder names)
//
// DEV_PORT (router, default 4200; plugins on the ports after it) and DEV_MOCK_PORT (default 8111) change the ports.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const testDir = join(root, 'test');

const angular = JSON.parse(readFileSync(join(root, 'angular.json'), 'utf8'));
const all: string[] = Object.values<{ projectType: string; root: string }>(angular.projects)
  .filter((p) => p.projectType === 'application' && existsSync(join(root, p.root, 'vite.config.ts')))
  .map((p) => p.root.replace(/^packages\//, ''));
const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !all.includes(name));
if (unknown.length) {
  console.error(`unknown plugin(s): ${unknown.join(', ')} — one of: ${all.join(', ')}`);
  process.exit(1);
}
const folders = wanted.length ? wanted : all;

// the c8y-ui CLI of test/'s ui-sdk, run with Node: a nested `pnpm exec` may pick a global pnpm of another version
const sdkManifest = createRequire(join(testDir, 'package.json')).resolve('@cumulocity-iot/ui-sdk/package.json');
const cli = join(dirname(sdkManifest), JSON.parse(readFileSync(sdkManifest, 'utf8')).bin['c8y-ui']);

const args = [
  cli,
  'dev',
  '--auth',
  'open',
  '--port',
  process.env.DEV_MOCK_PORT ?? '8111',
  '--dev-port',
  process.env.DEV_PORT ?? '4200',
  '--apps',
  folders.map((folder) => `../packages/${folder}`).join(','),
];
// test/ holds the mock's c8y-ui.json and world (not committed): pull it from windy-dev when missing
if (!existsSync(join(testDir, 'mock/windy-dev.json'))) {
  console.log('test/mock/windy-dev.json missing, pulling it from windy-dev …');
  const pull = spawnSync(process.execPath, [join(testDir, 'scripts/pull-world.mts')], { stdio: 'inherit' });
  if (pull.status !== 0) process.exit(pull.status ?? 1);
}

const dev = spawn(process.execPath, args, { cwd: testDir, stdio: 'inherit' });
dev.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => dev.kill(signal));
