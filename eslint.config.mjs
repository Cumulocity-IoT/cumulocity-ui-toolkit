import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
// The ui-sdk's rules for Web SDK apps (c8y/no-unmanaged-subscribe); the deprecated HOOK_* tokens are blocked below.
import c8y from '@cumulocity-iot/ui-sdk/eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    files: ['**/*.ts', '**/*.js'],
    // any additional configuration for these file types here
  },
  {
    ignores: [
      '.pnpmfile.cjs',
      '**/package.json',
      '**/package-lock.json',
      '**/node_modules',
      '**/dist',
      '**/main.ts',
      '**/bootstrap.ts',
      '**/polyfills.ts',
      '**/i18n.ts',
      '**/src/index.html',
      '**/test/playwright-results',
      '**/test/playwright-report',
      '**/*.html',
      'karma.conf.js',
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
    plugins: { c8y },

    rules: {
      'prettier/prettier': ['error'],

      // AP-09 of the ui-sdk's reviewing-code-quality skill: a subscribe() in a component, directive or pipe
      // without takeUntilDestroyed / takeUntil / take / first leaks when the view goes.
      'c8y/no-unmanaged-subscribe': 'warn',
      // AP-20: the HOOK_* tokens are deprecated; use hookTab, hookRoute, hookActionBar, hookWidget.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@c8y/ngx-components',
              importNames: ['HOOK_TABS', 'HOOK_ROUTE', 'HOOK_ACTION_BAR', 'HOOK_COMPONENTS'],
              message: 'The HOOK_* tokens are deprecated: use hookTab, hookRoute, hookActionBar, hookWidget (AP-20).',
            },
          ],
        },
      ],

      'no-console': [
        'error',
        {
          allow: ['warn', 'error'],
        },
      ],

      // Types are imported and re-exported with `type`: per-file compilers (Vite / esbuild /
      // OXC, ng's isolated mode) cannot see that a name is only a type. See AGENTS.md.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/consistent-type-exports': [
        'error',
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],

      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'none',
          // `const { dropped: _dropped, ...rest } = obj` is how a key is removed immutably
          ignoreRestSiblings: true,
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

      '@typescript-eslint/no-require-imports': [
        'error',
        {
          allow: ['.png$'],
        },
      ],
    },
  },
  {
    // Spec files are linted (they are the bulk of the type-unsafe code otherwise),
    // but a handful of rules fight unavoidable test idioms:
    //  - stubbing a collaborator means casting a partial literal to its type;
    //  - `expect(service.method).toHaveBeenCalled()` deliberately passes an
    //    unbound reference, which is exactly what `unbound-method` forbids;
    //  - reaching into a private member to test it needs an `any` cast.
    // Everything else — prettier, unused vars, no-console, formatting — still applies.
    files: ['**/*.spec.ts'],

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Jasmine's `describe`/`it` blocks are naturally long.
      '@typescript-eslint/member-ordering': 'off',
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
