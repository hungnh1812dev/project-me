import baseEslint from '@abyss/base-config/eslint';
import globals from 'globals';

/**
 * `identity` and `access` are used through their `index.ts` only. A regex
 * matches a path that goes below the module folder, so `../identity` passes
 * and `../identity/jwt.strategy` does not. Architecture specs read internals
 * on purpose and are exempt.
 */
const DEEP_IMPORT_PATTERNS = {
  identity: '(^|/)identity/.+',
  // `access/management` is the facade of the management sub-folder.
  // `access/field-projection` is not in the facade (it bypasses masking, see
  // facade-reexports.architecture.spec.ts); module-edge specs say who may use it.
  access: '(^|/)access/(?!management$|field-projection$).+',
};

const deepImportBan = (...moduleNames) => ({
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: moduleNames.map((moduleName) => ({
          regex: DEEP_IMPORT_PATTERNS[moduleName],
          message: `Import from the ${moduleName} module's index.ts, not from its internals.`,
        })),
      },
    ],
  },
});

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['src/generated/**'],
  }),
  { languageOptions: { globals: globals.node } },
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/modules/identity/**',
      'src/modules/access/**',
      'src/architecture/**',
    ],
    ...deepImportBan('identity', 'access'),
  },
  { files: ['src/modules/identity/**/*.ts'], ...deepImportBan('access') },
  { files: ['src/modules/access/**/*.ts'], ...deepImportBan('identity') },
];
