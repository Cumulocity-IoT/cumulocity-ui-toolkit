import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    files: ['**/*.ts', '**/*.js', '**/*.html'],

    // any additional configuration for these file types here
  },
  {
    ignores: [
      '**/package.json',
      '**/package-lock.json',
      '**/node_modules',
      'src/polyfills.ts',
      'src/i18n.ts',
      '**/dist',
      '**/node_modules',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
  },
  ...compat
    .extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking',
      'plugin:prettier/recommended',
      'prettier'
    )
    .map((config) => ({
      ...config,
      files: ['**/*.ts'],
    })),
  {
    files: ['**/*.ts'],

    rules: {
      'prettier/prettier': ['error'],

      'no-console': [
        'error',
        {
          allow: ['warn', 'error'],
        },
      ],

      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: false,
        },
      ],

      'explicit-module-boundary-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',

      '@typescript-eslint/member-ordering': [
        'warn',
        {
          default: ['field', 'constructor', 'protected-method', 'public-method', 'private-method'],
        },
      ],

      '@/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: '*',
          next: ['multiline-block-like', 'return'],
        },
        {
          blankLine: 'always',
          prev: ['import', 'export'],
          next: '*',
        },
        {
          blankLine: 'never',
          prev: 'import',
          next: 'import',
        },
        {
          blankLine: 'never',
          prev: 'export',
          next: 'export',
        },
        {
          blankLine: 'always',
          prev: ['const', 'let'],
          next: '*',
        },
        {
          blankLine: 'any',
          prev: ['const', 'let'],
          next: ['const', 'let', 'return'],
        },
        {
          blankLine: 'any',
          prev: '*',
          next: 'export',
        },
      ],

      '@/lines-between-class-members': [
        'error',
        'always',
        {
          exceptAfterSingleLine: true,
        },
      ],

      '@typescript-eslint/unbound-method': [
        'error',
        {
          ignoreStatic: true,
        },
      ],

      'brace-style': [
        'error',
        '1tbs',
        {
          allowSingleLine: false,
        },
      ],

      curly: 'error',
    },
  },
  ...compat.extends('plugin:@angular-eslint/template/recommended').map((config) => ({
    ...config,
    files: ['**/*.html'],
  })),
  {
    files: ['**/*.html'],
    rules: {},
  },
  ...compat.extends('plugin:prettier/recommended').map((config) => ({
    ...config,
    files: ['**/*.html'],
  })),
  {
    files: ['**/*.html'],

    rules: {
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
          parser: 'angular',
        },
      ],
    },
  },
  eslintConfigPrettier,
];
