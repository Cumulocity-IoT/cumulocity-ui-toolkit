#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = path.join(process.cwd(), 'package.json');
const ANGULAR_JSON_PATH = path.join(process.cwd(), 'angular.json');

// -------------------------------------------------------------
// 1. Load package.json
// -------------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
pkg.scripts = pkg.scripts || {};

// -------------------------------------------------------------
// 2. Load angular.json and find plugin projects
// -------------------------------------------------------------
const angular = JSON.parse(fs.readFileSync(ANGULAR_JSON_PATH, 'utf8'));
const projects = angular.projects || {};

const plugins = Object.keys(projects).filter((name) => name.startsWith('plugin.'));

console.log(`🔎 Found ${plugins.length} plugin packages:`, plugins);

// -------------------------------------------------------------
// 3. Remove previously generated scripts
// -------------------------------------------------------------
Object.keys(pkg.scripts)
  .filter(
    (name) =>
      name.startsWith('serve:') ||
      name.startsWith('build:') ||
      name.startsWith('postbuild:') ||
      name.startsWith('test:')
  )
  .forEach((script) => {
    delete pkg.scripts[script];
  });
console.log('♻️  Removed all existing plugin scripts from package.json.');

// -------------------------------------------------------------
// 4. Generate scripts for each plugin
// -------------------------------------------------------------
plugins.forEach((plugin) => {
  const short = plugin.replace('plugin.', '');

  pkg.scripts[`serve:${short}`] = `npm run _serve ${plugin}`;
  pkg.scripts[`build:${short}`] = `ng build ${plugin}`;
  // pkg.scripts[`postbuild:${short}`] = `npm run _postbuild packages/${plugin.replace('plugin.', '')}`;
  pkg.scripts[`test:${short}`] = `npm run _test ${plugin}`;
});

// -------------------------------------------------------------
// 5. Write updated package.json
// -------------------------------------------------------------
fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Updated package.json with generated scripts!');
