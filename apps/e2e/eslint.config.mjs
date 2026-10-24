import baseEslint from '@abyss/base-config/eslint';
import globals from 'globals';

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['playwright-report/**', 'test-results/**', 'blob-report/**'],
  }),
  { languageOptions: { globals: globals.node } },
  {
    files: ['tests/**/*.ts', 'src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cms-admin/src/**', '**/web/src/**'],
              message: 'Import app code through src/app-contracts.ts.',
            },
            {
              group: ['node:child_process', 'child_process'],
              message:
                'Run SQL and shell commands through src/smoke-database.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration[id.name=/^signIn/]',
          message:
            'Sign in through signInAs / submitLogin from src/session.ts.',
        },
        {
          selector:
            'Program > VariableDeclaration > VariableDeclarator[id.name=/^(RUN_ID|HTTP|HTTP_.*|CV_SLUG|PROFILE_SLUG|CONTENT_TYPE_SLUG)$/]',
          message:
            'Import RUN_ID, HTTP and the content type slugs from src/run-id.ts, src/constants.ts and src/content-types.ts.',
        },
        {
          selector:
            'Program > VariableDeclaration > VariableDeclarator[id.name=/^(label|item)$/]',
          message: 'Import the shared locators from src/locators.ts.',
        },
        {
          selector: `Literal[value=/^\\/(auth|setup|documents|reviewer|api-tokens|media|accounts|graphql|presence)\\//]`,
          message: 'Spell cms-api paths in src/api-paths.ts only.',
        },
        {
          selector: `TemplateElement[value.raw=/^\\/(auth|setup|documents|reviewer|api-tokens|media|accounts|graphql|presence)\\//]`,
          message: 'Spell cms-api paths in src/api-paths.ts only.',
        },
        {
          selector: 'Literal[value=/^(cv-page|profile)$/]',
          message: 'Use CV_PAGE_SLUG / PROFILE_SLUG from src/content-types.ts.',
        },
      ],
    },
  },
  {
    files: ['src/app-contracts.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/smoke-database.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
