#!/usr/bin/env node
const { execSync } = require('child_process');
const plugin = process.argv[2];

if (!plugin) {
  console.error('Usage: postbuild <packages/...>');
  process.exit(1);
}

execSync(`node tools/build-rename.js -p '${plugin}'`, { stdio: 'inherit' });
