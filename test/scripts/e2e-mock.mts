// Runs a plugin's Playwright suite against an emulated tenant instead of a real one:
// the ui-sdk mock serves the windy-dev world (mock/windy-dev.json, pulled from the
// tenant when missing — it is not committed) and the cockpit
// release build of the Web SDK version the workspace is on (root package.json →
// @c8y/ngx-components), the plugin's dev server proxies to it.
//   node scripts/e2e-mock.mts <plugin> [--open] [--headed] [--frozen] [--spec=<filter>] [<other playwright test args>]
// Arguments it does not know go to `playwright test` as they are (`--repeat-each=3`, more filters).
// --frozen: the mock's clock stays at the world's `now` and the browser's Date a minute after it, so two runs render
// the same to the pixel (review screenshots, CI compares the base branch with the change). The specs' reviewScreenshot()
// files (named <plugin>/<view>) are collected in a temporary folder and copied to review-screenshots/ when the run ends
// (a full run of the plugin replaces review-screenshots/<plugin>/, one with --spec or --open adds to it).
// E2E_MOCK_PORT / E2E_DEV_PORT override the ports from c8y-ui.json (parallel runs).
// E2E_SHELL_VERSION runs the plugin in another cockpit release (shell-compat.yml: the latest CD release),
// E2E_MOCK_GAPS=<file> lists the requests the mock does not emulate (endpoints or parameters it lacks).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readConfig, startProjectMock, writeConfig } from '@cumulocity-iot/ui-sdk';

const testDir = resolve(import.meta.dirname, '..');
const rootDir = resolve(testDir, '..');
const [plugin, ...rest] = process.argv.slice(2);
// pnpm drops the first `--` of `pnpm run e2e:mock <plugin> -- …`: everything not meant for this script is passed on.
const open = rest.includes('--open');
const headed = rest.includes('--headed');
const frozen = rest.includes('--frozen');
const spec = rest.find((a) => a.startsWith('--spec='))?.split('=')[1];
const own = new Set(['--', '--open', '--headed', '--frozen']);
const passThrough = rest.filter((a) => !own.has(a) && !a.startsWith('--spec='));
if (!plugin || !existsSync(resolve(rootDir, 'packages', plugin))) {
  console.error('usage: e2e-mock.mts <plugin> [--open] [--headed] [--frozen] [--spec=<filter>] [<playwright test args>]');
  process.exit(1);
}

// Follow the workspace's Web SDK version; the shell checksum for a new version is recorded on first download.
const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const version: string = process.env.E2E_SHELL_VERSION || rootPkg.dependencies['@c8y/ngx-components'];
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

// A run right after another on the same ports (CI takes the review screenshots of the change and of the base branch
// back to back) finds the previous mock still closing: wait for the port instead of failing on EADDRINUSE.
async function waitForPortFree(port: number, timeoutMs: number): Promise<void> {
  const free = () =>
    new Promise<boolean>((done) => {
      const probe = createServer();

      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
  const end = Date.now() + timeoutMs;

  while (!(await free())) {
    if (Date.now() > end) throw new Error(`port ${port} is still taken after ${timeoutMs / 1000}s`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

if (!existsSync(resolve(testDir, config.world))) {
  console.log(`${config.world} missing, pulling it from windy-dev …`);
  const pull = spawnSync(process.execPath, [resolve(import.meta.dirname, 'pull-world.mts')], { stdio: 'inherit' });
  if (pull.status !== 0) process.exit(pull.status ?? 1);
}

await waitForPortFree(mockPort, 30_000);
await waitForPortFree(devPort, 30_000);
const gaps = new Set<string>();
const project = await startProjectMock(testDir, {
  watch: false,
  port: mockPort,
  frozen,
  // gap: a documented endpoint (or parameter) the mock does not implement; plain 404/405s are what a tenant answers too
  onGap: (r) => {
    if (r.gap) gaps.add(`${r.status} ${r.method} ${r.path}${r.unhandled?.length ? ` (unhandled: ${r.unhandled.join(', ')})` : ''}`);
  },
});
const { mock } = project;
const world = mock.world();
const devUrl = `http://localhost:${devPort}`;
// The specs' review screenshots (named <plugin>/<view>): written outside the project while the tests run (the dev
// server watches it) and copied to review-screenshots/ afterwards.
const shots = mkdtempSync(join(tmpdir(), 'c8y-ui-e2e-'));
const reviewDir = resolve(testDir, 'review-screenshots');
console.log(`mock ${mock.url} (cockpit ${version}, world ${config.world}${frozen ? `, frozen at ${world.now}` : ''})`);

const serve = run(
  'pnpm',
  ['exec', 'ng', 'serve', `plugin.${plugin}`, '--port', String(devPort), '--public-host', `localhost:${devPort}`, '-u', mock.url.replace('127.0.0.1', 'localhost')],
  rootDir
);

let code = 1;
try {
  await waitFor(`${devUrl}/apps/cockpit/index.html`, 300_000);
  const playwright = run(
    resolve(testDir, 'node_modules/.bin/playwright'),
    ['test', ...(open ? ['--ui'] : []), ...(headed ? ['--headed'] : []), ...(spec ? [spec] : []), ...passThrough],
    testDir,
    {
      // What @cumulocity-iot/ui-sdk/playwright reads: the dev server, the shell, the world's login (any password
      // for users without one), and the mock's URL so each test reports its name for the gap report.
      E2E_PLUGIN: plugin,
      C8Y_BASEURL: devUrl,
      C8Y_SHELL: 'cockpit',
      C8Y_TENANT: world.tenant.id,
      C8Y_USERNAME: world.currentUser,
      C8Y_PASSWORD: process.env.C8Y_MOCK_PASSWORD ?? 'mock-password',
      C8Y_MOCK_URL: mock.url,
      C8Y_SCREENSHOTS_DIR: shots,
      ...(frozen ? { C8Y_FROZEN_NOW: world.now } : {}),
    }
  );
  code = await new Promise<number>((done) => playwright.on('exit', (c) => done(c ?? 1)));
} finally {
  serve.kill();
  await project.close();
  if (process.env.E2E_MOCK_GAPS) writeFileSync(process.env.E2E_MOCK_GAPS, [...gaps].map((g) => `${g}\n`).join(''));
  if (!open && !spec && (code === 0 || existsSync(shots))) rmSync(join(reviewDir, plugin), { recursive: true, force: true });
  if (existsSync(shots)) cpSync(shots, reviewDir, { recursive: true });
  rmSync(shots, { recursive: true, force: true });
}
process.exit(code);
