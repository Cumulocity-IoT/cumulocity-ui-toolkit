import type { Config } from 'jest';

const config: Config = {
  projects: ['<rootDir>/packages/*'],
  // Prevent the root config from running tests directly; all tests run via project configs.
  // testRegex: '^$' matches only the empty string, which no real file path is.
  testRegex: '^$',
};

export default config;
