import type { ConfigurationOptions } from '@c8y/devkit';
import { author, description, version } from './package.json';
import { license } from '../../package.json';

export default {
  runTime: {
    author,
    description,
    version,
    name: 'Release Notes',
    contextPath: 'release-notes-plugin',
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    remotes: {
      // 'plugin name from package.json': [ PluginProviders, ... ]
      'release-notes-plugin': ['ReleaseNotesAdminPluginProviders', 'ReleaseNotesPluginProviders'],
    },
    package: 'plugin',
    isPackage: true,
    noAppSwitcher: true,
    exports: [
      {
        name: 'Release Notes Admin',
        module: 'ReleaseNotesAdminPluginProviders',
        path: './src/app/plugin/release-notes-admin-plugin.module.ts',
        readmePath: './src/admin-plugin/README.md',
        description: 'Provides an admin interface to create, update and delete release notes',
      },
      {
        name: 'Release Notes Display',
        module: 'ReleaseNotesPluginProviders',
        path: './src/app/plugin/release-notes-plugin.module.ts',
        readmePath: './src/display-plugin/README.md',
        description: '',
      },
    ],
    license,
  },
  buildTime: {
    federation: [
      '@angular/animations',
      '@angular/cdk',
      '@angular/common',
      '@angular/compiler',
      '@angular/core',
      '@angular/forms',
      '@angular/platform-browser',
      '@angular/platform-browser-dynamic',
      '@angular/router',
      '@angular/upgrade',
      '@c8y/client',
      '@c8y/ngx-components',
      'ngx-bootstrap',
      '@ngx-translate/core',
      '@ngx-formly/core',
    ],
  },
} as const satisfies ConfigurationOptions;
