import type { ConfigurationOptions } from '@c8y/devkit/options';
import packageInfo from '../../../package.json';

export default {
  runTime: {
    name: 'operation Control Center',
    contextPath: 'controlcenter',
    key: 'controlcenter-application-key',
    author: packageInfo.author,
    description: packageInfo.description,
    version: packageInfo.version,
    globalTitle: 'Operation Control Center',
    tabsHorizontal: true,
    rightDrawer: true,
    breadcrumbs: false,
    sensorAppOneLink: 'http://onelink.to/pca6qe',
    sensorPhone: true,
    contentSecurityPolicy:
      "base-uri 'none'; default-src 'self' 'unsafe-inline' http: https: ws: wss:; connect-src 'self' http: https: ws: wss: data:;  script-src 'self' *.bugherd.com *.twitter.com *.twimg.com *.aptrinsic.com 'unsafe-inline' 'unsafe-eval' data:; style-src * 'unsafe-inline' blob:; img-src * data: blob:; font-src * data:; frame-src *; worker-src 'self' blob:;",
    dynamicOptionsUrl: '/apps/public/public-options/options.json',
    contextHelp: true,
    upgrade: true,
    icon: {
      class: 'c8y-icon-duocolor c8y-icon-circle-star',
    },
    languages: {
      en: {
        name: 'English',
        nativeName: 'English',
        url: './en.json',
      },
      de: {
        name: 'German',
        nativeName: 'Deutsch',
        url: './de.json',
      },
    },
    docs: {
      noDefault: true,
      links: [
        {
          icon: '',
          type: 'doc',
          label: 'User Documentation',
          url: 'https://enercon365.sharepoint.com/sites/GSServiceEngineering/SitePages/Software-ECC.aspx',
        },
      ],
    },
  },
  buildTime: {
    brandingEntry: './src/styles/style.less',
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
      'angular',
      'ngx-bootstrap',
      '@ngx-translate/core',
      '@ngx-formly/core',
    ],
  },
} as const satisfies ConfigurationOptions;
