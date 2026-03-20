import type { ConfigurationOptions } from '@c8y/devkit';
import { author, version } from './package.json';

export default {
  runTime: {
    author,
    description: 'IndexedDB cache service plugin',
    version,
    name: 'Index DB Cache',
    globalTitle: 'Index DB Cache',
    contextPath: 'ps-iot-pkg-index-db-cache-plugin',
    key: 'ps-iot-pkg-index-db-cache-plugin-key',
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    exports: [
      {
        name: 'Index DB Cache',
        module: 'indexDbCacheModule',
        path: './src/app/index.ts',
        description: 'IndexedDB cache service plugin',
      },
    ],
    remotes: {
      'ps-iot-pkg-index-db-cache-plugin': ['indexDbCacheModule'],
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
  },
} as ConfigurationOptions;
