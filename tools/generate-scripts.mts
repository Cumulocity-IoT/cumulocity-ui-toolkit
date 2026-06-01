#!/usr/bin/env node
/**
 * generate-scripts.ts
 *
 * Derives build/serve/test scripts from angular.json and writes them into the
 * root package.json.  Run with Node 24's native TypeScript support:
 *
 *   node --experimental-strip-types tools/generate-scripts.ts
 *
 * Source of truth for test targets: the `test` target in angular.json must use
 * `@angular/build:karma`.  Projects that lack that target get no test script.
 *
 * Generated scripts (everything after the "--generated----------" marker):
 *
 *   build:<lib>              ng build <lib>
 *   serve:<plugin>           pnpm run _serve plugin.<plugin>
 *   build:<plugin>           ng build plugin.<plugin>
 *   test:<project>           ng test <project> --watch=false --browsers=ChromeHeadlessCI
 *   test:watch:<project>     ng test <project> --browsers=ChromeHeadless
 *
 * The top-level `test` script (before the marker) is also regenerated to chain
 * all karma-enabled projects in CI mode (libraries first, then plugins).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const ANGULAR_JSON_PATH = path.join(ROOT, 'angular.json');

// ─── Types ───────────────────────────────────────────────────────────────────

interface Scripts {
  [key: string]: string;
}

interface Pkg {
  scripts: Scripts;
  [key: string]: unknown;
}

interface AngularTarget {
  builder: string;
  [key: string]: unknown;
}

interface AngularProject {
  projectType?: 'application' | 'library';
  architect?: Record<string, AngularTarget>;
  targets?: Record<string, AngularTarget>;
}

interface AngularJson {
  projects: Record<string, AngularProject>;
}

// ─── Load ────────────────────────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8')) as Pkg;
const angular = JSON.parse(fs.readFileSync(ANGULAR_JSON_PATH, 'utf8')) as AngularJson;
const projects = angular.projects;

// ─── Classify projects ────────────────────────────────────────────────────────

const getTargets = (p: AngularProject): Record<string, AngularTarget> =>
  p.architect ?? p.targets ?? {};

const shortName = (project: string): string => project.replace(/^plugin\./, '');

const plugins: string[] = Object.keys(projects)
  .filter((n) => n.startsWith('plugin.'))
  .sort();

const libraries: string[] = Object.entries(projects)
  .filter(([, p]) => p.projectType === 'library')
  .map(([n]) => n)
  .sort();

/** Projects with an @angular/build:karma test target — source of truth for test scripts. */
const karmaProjects: string[] = Object.entries(projects)
  .filter(([, p]) => getTargets(p)['test']?.builder === '@angular/build:karma')
  .map(([n]) => n);

const karmaLibs: string[] = karmaProjects.filter((n) => libraries.includes(n)).sort();
const karmaPlugins: string[] = karmaProjects.filter((n) => plugins.includes(n)).sort();
const allKarmaInOrder: string[] = [...karmaLibs, ...karmaPlugins];

console.log(`📦 Libraries    : ${libraries.join(', ')}`);
console.log(`🔌 Plugins (${plugins.length})  : ${plugins.map(shortName).join(', ')}`);
console.log(`🧪 Karma targets: ${allKarmaInOrder.join(', ') || '(none)'}`);

// ─── Rebuild root `test` script ───────────────────────────────────────────────

const CI_FLAGS = '--watch=false --browsers=ChromeHeadlessCI';

pkg.scripts['test'] =
  allKarmaInOrder.length > 0
    ? allKarmaInOrder.map((p) => `ng test ${p} ${CI_FLAGS}`).join(' && ')
    : 'echo "No karma test targets configured"';

// ─── Clear generated section ──────────────────────────────────────────────────

const GENERATED_MARKER = '--generated----------';
const existingKeys = Object.keys(pkg.scripts);
const markerIdx = existingKeys.indexOf(GENERATED_MARKER);

if (markerIdx !== -1) {
  // Remove everything after the marker (previously generated scripts)
  for (const key of existingKeys.slice(markerIdx + 1)) {
    delete pkg.scripts[key];
  }
} else {
  // Marker was removed manually — re-add it at the end
  pkg.scripts[GENERATED_MARKER] = '--------------------';
  console.warn(`⚠️  Marker "${GENERATED_MARKER}" was missing — re-added at end of scripts.`);
}

// ─── Emit generated scripts ───────────────────────────────────────────────────

// Library builds come first so `run-s build:*` builds shared before plugins
for (const lib of libraries) {
  pkg.scripts[`build:${lib}`] = `ng build ${lib}`;
}

// Plugin serve + build (alphabetical short name = alphabetical project name here)
for (const plugin of plugins) {
  const short = shortName(plugin);
  pkg.scripts[`serve:${short}`] = `pnpm run _serve ${plugin}`;
  pkg.scripts[`build:${short}`] = `ng build ${plugin}`;
}

// Test scripts — only for projects that actually have a karma target in angular.json
for (const project of allKarmaInOrder) {
  const short = shortName(project);
  pkg.scripts[`test:${short}`] = `ng test ${project} ${CI_FLAGS}`;
  pkg.scripts[`test:watch:${short}`] = `ng test ${project} --browsers=ChromeHeadless`;
}

// ─── Write ────────────────────────────────────────────────────────────────────

fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n');

const buildCount = libraries.length + plugins.length;
const testCount = allKarmaInOrder.length;

console.log(`✅  package.json updated`);
console.log(`    build : ${libraries.length} lib + ${plugins.length} plugin = ${buildCount} scripts`);
console.log(`    serve : ${plugins.length} scripts`);
console.log(`    test  : ${testCount} projects → ${testCount * 2} scripts (CI + watch)`);
console.log(`    root test: "${pkg.scripts['test']}"`);
