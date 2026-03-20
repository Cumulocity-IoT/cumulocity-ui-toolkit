import type { Config } from 'jest';

const config: Config = {
  displayName: 'dynamic-aggregation-line-chart',
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/../../setup-jest.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!.*(lodash-es|.mjs))'],
  moduleNameMapper: {
    '^~components/(.*)$': '<rootDir>/../shared/src/components/$1',
    '^~helpers/(.*)$': '<rootDir>/../shared/src/helpers/$1',
    '^~models/(.*)$': '<rootDir>/../shared/src/models/$1',
    '^~pipes/(.*)$': '<rootDir>/../shared/src/pipes/$1',
    '^~services/(.*)$': '<rootDir>/../shared/src/services/$1',
    '^shared$': '<rootDir>/../shared/src/index.ts',
  },
};

export default config;
