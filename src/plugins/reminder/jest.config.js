const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../../../tsconfig.json');

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'controlcenter',
  preset: 'jest-preset-angular',
  testEnvironment: './src/test/CustomJSDOMEnvironment.ts',
  setupFilesAfterEnv: ['../../../setup-jest.ts'],
  transformIgnorePatterns: ['/!node_modules\\/lodash-es/'],
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage/controlcenter',
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>../../../' }),
};
