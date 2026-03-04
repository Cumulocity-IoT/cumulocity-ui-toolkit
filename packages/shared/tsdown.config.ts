import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: [
    /^@angular\//,
    /^@c8y\//,
    /^@ngx-/,
    'rxjs',
    'rxjs/operators',
    'tslib',
    'zone.js',
  ],
});
