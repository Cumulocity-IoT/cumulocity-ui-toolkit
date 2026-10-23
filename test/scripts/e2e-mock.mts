// Runs a plugin's Cypress suite against an emulated tenant instead of a real one:
// the ui-sdk mock serves the windy-dev world (mock/windy-dev.json, pulled from the
// tenant when missing — it is not committed) and the cockpit
// release build of the Web SDK version the workspace is on (root package.json →
// @c8y/ngx-components), the plugin's dev server proxies to it.
//   node scripts/e2e-mock.mts <plugin> [--open] [--browser=chrome] [--spec=<file>]
// E2E_MOCK_PORT / E2E_DEV_PORT override the ports from c8y-ui.json (parallel runs).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig, startProjectMock, writeConfig } from '@cumulocity-iot/ui-sdk';

const testDir = resolve(import.meta.dirname, '..');
const rootDir = resolve(testDir, '..');
const [plugin, ...rest] = process.argv.slice(2);
const open = rest.includes('--open');
const spec = rest.find((a) => a.startsWith('--spec='))?.split('=')[1];
const browser = rest.find((a) => a.startsWith('--browser='))?.split('=')[1] ?? 'chromium';
if (!plugin) {
  console.error('usage: e2e-mock.mts <plugin> [--open] [--browser=chrome]');
  process.exit(1);
}

// Follow the workspace's Web SDK version; the shell checksum for a new version is recorded on first download.
const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const version: string = rootPkg.dependencies['@c8y/ngx-components'];
const config = readConfig(testDir);
if (config.version !== version) {
  config.version = version;
  writeConfig(testDir, config);
}
const mockPort = Number(process.env.E2E_MOCK_PORT ?? config.port);
const devPort = Number(process.env.E2E_DEV_PORT ?? config.devPort);

const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): ChildProcess =>
  spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fetch(url).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${url} did not come up within ${timeoutMs / 1000}s`);
}

if (!existsSync(resolve(testDir, config.world))) {
  console.log(`${config.world} missing, pulling it from windy-dev …`);
  const pull = spawnSync(process.execPath, [resolve(import.meta.dirname, 'pull-world.mts')], { stdio: 'inherit' });
  if (pull.status !== 0) process.exit(pull.status ?? 1);
}

const project = await startProjectMock(testDir, { watch: false, port: mockPort });
const { mock } = project;
const world = mock.world();
const devUrl = `http://localhost:${devPort}`;
console.log(`mock ${mock.url} (cockpit ${version}, world ${config.world})`);

const serve = run(
  'pnpm',
  ['exec', 'ng', 'serve', `plugin.${plugin}`, '--port', String(devPort), '--public-host', `localhost:${devPort}`, '-u', mock.url.replace('127.0.0.1', 'localhost')],
  rootDir
);

let code = 1;
try {
  await waitFor(`${devUrl}/apps/cockpit/index.html`, 300_000);
  const cypress = run(
    'pnpm',
    ['-C', 'test', 'exec', '--', 'cypress', open ? 'open' : 'run', ...(open ? [] : ['--browser', browser]), '--config-file', `config/${plugin}.config.ts`, ...(spec ? ['--spec', spec] : [])],
    rootDir,
    {
      C8Y_CYPRESS_URL: devUrl,
      C8Y_SHELL_TARGET: 'cockpit',
      C8Y_TENANT: world.tenant.id,
      C8Y_USERNAME: world.currentUser,
      // Users without a password in the world accept any.
      C8Y_PASSWORD: process.env.C8Y_MOCK_PASSWORD ?? 'mock-password',
      C8Y_MOCK_URL: mock.url,
    }
  );
  code = await new Promise<number>((done) => cypress.on('exit', (c) => done(c ?? 1)));
} finally {
  serve.kill();
  await project.close();
}
process.exit(code);
