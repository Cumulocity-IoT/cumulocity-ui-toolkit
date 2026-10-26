import type { ConfigurationOptions } from '@c8y/devkit';
import { author, description, version } from './package.json';
import { license } from '../../package.json';

export default {
  runTime: {
    author,
    description,
    version,
    name: 'Events Graph Widget',
    contextPath: 'ps-iot-pkg-events-graph-widget-plugin',
    key: 'ps-iot-pkg-events-graph-widget-plugin-key',
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    remotes: {
      // '<contextPath>': [ PluginProviders ]
      'ps-iot-pkg-events-graph-widget-plugin': ['EventsGraphWidgetPluginProviders'],
    },
    package: 'plugin',
    isPackage: true,
    noAppSwitcher: true,
    exports: [
      {
        name: 'Events Graph Widget',
        module: 'EventsGraphWidgetPluginProviders',
        path: './src/app/events-graph-widget/events-graph-widget.providers.ts',
        description,
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
