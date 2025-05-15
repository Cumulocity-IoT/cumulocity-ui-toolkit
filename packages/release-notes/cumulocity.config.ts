import type { ConfigurationOptions } from '@c8y/devkit';
import { author, name, description, version } from './package.json';

export default {
  runTime: {
    author,
    description,
    version,
    name,
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    remotes: {
      // 'plugin name from package.json': [ PluginModule ]
      'cumulocity-release-notes-plugin': [
        'ReleaseNotesAdminPluginModule',
        'ReleaseNotesPluginModule',
      ],
    },
    package: 'plugin',
    isPackage: true,
    noAppSwitcher: true,
    exports: [
      {
        name: 'Release Notes Admin',
        module: 'ReleaseNotesAdminPluginModule',
        path: './src/app/plugin/release-notes-admin-plugin.module.ts',
        description: 'Provides an admin interface to create, update and delete release notes',
      },
      {
        name: 'Release Notes Display',
        module: 'ReleaseNotesPluginModule',
        path: './src/app/plugin/release-notes-plugin.module.ts',
        description: '',
      },
    ],
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
