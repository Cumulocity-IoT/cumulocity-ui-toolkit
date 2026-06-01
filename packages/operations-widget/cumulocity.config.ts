import type { ConfigurationOptions } from '@c8y/devkit';
import pkg from './package.json';
import rootPkg from '../../package.json';

const { author, description, name, version } = pkg;
const { license } = rootPkg;

export default {
  runTime: {
    author,
    description,
    version,
    name: 'Operations Widget',
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    remotes: {
      // 'plugin name from package.json': [ PluginProviders ]
      [name]: ['OperationsWidgetPluginConfigProviders'],
    },
    package: 'plugin',
    isPackage: true,
    noAppSwitcher: true,
    exports: [
      {
        name: 'Operations Widget',
        module: 'OperationsWidgetPluginConfigProviders',
        path: './src/app/index.ts',
        readmePath: './src/README.md',
        description:
          'Configurable action buttons with labels, icons, and input fields to send parameterized operation to device.',
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
