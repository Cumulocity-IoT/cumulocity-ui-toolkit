const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    'src/apps/controlcenter',
    {
      displayName: 'base',
      preset: 'jest-preset-angular',
      testEnvironment: './src/test/CustomJSDOMEnvironment.ts',
      setupFilesAfterEnv: ['./setup-jest.ts'],
      transformIgnorePatterns: ['/!node_modules\\/lodash-es/'],
      roots: ['<rootDir>/src'],
      modulePathIgnorePatterns: ['<rootDir>/src/apps'],
      coverageDirectory: 'coverage/controlcenter',
      moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>' }),
    },
  ],
  collectCoverage: true,
  coverageReporters: ['html', 'text'],
};
