import type { ConfigurationOptions } from '@c8y/devkit';
import { author, version } from './package.json';

export default {
  runTime: {
    author,
    description: 'Dynamic Aggregation Line Chart',
    version,
    name: 'Dynamic Aggregation Line Chart',
    globalTitle: 'Dynamic Aggregation Line Chart',
    contextPath: 'ps-iot-pkg-dynamic-aggregation-line-chart-plugin',
    key: 'ps-iot-pkg-dynamic-aggregation-line-chart-plugin-key',
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: true,
    exports: [
      {
        name: 'Dynamic Aggregation Line Chart',
        module: 'DynamicAggregationLineChartModule',
        path: './src/app/modules/dynamic-aggregation-line-chart/ps-line-chart.module.ts',
        description:
          'A dynamic aggregation line chart displaying min/avg/max time-series measurement data.',
      },
    ],
    remotes: {
      'ps-iot-pkg-dynamic-aggregation-line-chart-plugin': ['DynamicAggregationLineChartModule'],
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
} as const satisfies ConfigurationOptions;
