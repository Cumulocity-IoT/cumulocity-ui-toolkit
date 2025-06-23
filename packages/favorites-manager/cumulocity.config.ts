import type { ConfigurationOptions } from '@c8y/devkit';
import { author, version } from './package.json';

export default {
  runTime: {
    author,
    description:
      'Mark any asset or device as a favorite to quickly access these in your personal favorites list',
    version,
    name: 'Favorites Manager',
    globalTitle: 'Favorites Manager',
    contextPath: 'sag-ps-iot-pkg-favorites-manager-plugin',
    key: 'sag-ps-iot-pkg-favorites-manager-plugin-key',
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    exports: [
      {
        name: 'Favorites Manager',
        module: 'pluginViewProviders',
        path: './src/app/modules/favorites-manager/index.ts',
        description:
          'Mark any asset or device as a favorite to quickly access these in your personal favorites list',
      },
    ],
    remotes: {
      'favorites-manager-plugin': ['pluginViewProviders'],
    },
    package: 'plugin',
    isPackage: true,
    noAppSwitcher: true,
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
    copy: [
      {
        from: 'packages/favorites-manager/assets',
        to: 'assets',
      },
    ],
  },
} as const satisfies ConfigurationOptions;
