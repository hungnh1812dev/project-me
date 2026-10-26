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
              message: 'Import app code through src/AppContracts.contract.ts.',
            },
            {
              group: ['node:child_process', 'child_process'],
              message:
                'Run SQL and shell commands through src/SmokeDatabase.client.ts.',
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
            'Sign in through signInAs / submitLogin from src/Session.fixture.ts.',
        },
        {
          selector:
            'Program > VariableDeclaration > VariableDeclarator[id.name=/^(RUN_ID|HTTP|HTTP_.*|CV_SLUG|PROFILE_SLUG|CONTENT_TYPE_SLUG)$/]',
          message:
            'Import RUN_ID, HTTP and the content type slugs from src/RunId.constants.ts, src/E2e.constants.ts and src/ContentTypes.constants.ts.',
        },
        {
          selector:
            'Program > VariableDeclaration > VariableDeclarator[id.name=/^(label|item)$/]',
          message: 'Import the shared locators from src/Locators.fixture.ts.',
        },
        {
          selector: `Literal[value=/^\\/(auth|setup|documents|reviewer|api-tokens|media|accounts|graphql|presence)\\//]`,
          message: 'Spell cms-api paths in src/ApiPaths.constants.ts only.',
        },
        {
          selector: `TemplateElement[value.raw=/^\\/(auth|setup|documents|reviewer|api-tokens|media|accounts|graphql|presence)\\//]`,
          message: 'Spell cms-api paths in src/ApiPaths.constants.ts only.',
        },
        {
          selector: 'Literal[value=/^(cv-page|profile)$/]',
          message:
            'Use CV_PAGE_SLUG / PROFILE_SLUG from src/ContentTypes.constants.ts.',
        },
      ],
    },
  },
  {
    files: ['src/AppContracts.contract.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/SmokeDatabase.client.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
