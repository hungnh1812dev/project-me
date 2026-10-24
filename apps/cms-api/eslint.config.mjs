import baseEslint from '@abyss/base-config/eslint';
import globals from 'globals';

/**
 * Every module is used through its `index.ts` only. A regex matches a path
 * that goes below the module folder, so `../identity` passes and
 * `../identity/jwt.strategy` does not. Architecture specs read internals on
 * purpose and are exempt.
 */
const modulePath = (moduleName, unbannedFiles = []) => {
  const exceptions = unbannedFiles.map((file) => `${file}$`).join('|');
  const allowed = exceptions === '' ? '' : `(?!${exceptions})`;
  return `^(?:\\.{1,2}/)+(?:modules/)?${moduleName}/${allowed}.+`;
};

const DEEP_IMPORT_PATTERNS = {
  identity: '(^|/)identity/.+',
  // `access/management` is the facade of the management sub-folder.
  // `access/document-auth` is the facade of the document-auth part (not in
  // `index.ts`: identity imports that, and document-auth imports identity).
  // `access/field-projection` is not in the facade (it bypasses masking, see
  // facade-reexports.architecture.spec.ts); module-edge specs say who may use it.
  access: '(^|/)access/(?!management$|document-auth$|field-projection$).+',
  // `content.repository` and `tree-loader` are not in the facade for the same
  // reason: only the files the record-serializer architecture spec names use them.
  'content-engine': modulePath('content-engine', [
    'content\\.repository',
    'tree-loader',
  ]),
  documents: modulePath('documents'),
  graphql: modulePath('graphql'),
  media: modulePath('media'),
  reviewer: modulePath('reviewer'),
  'content-types': modulePath('content-types'),
  health: modulePath('health'),
  'security-audit': modulePath('security-audit'),
};

const moduleNames = Object.keys(DEEP_IMPORT_PATTERNS);

const deepImportBan = (bannedModules) => ({
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: bannedModules.map((moduleName) => ({
          regex: DEEP_IMPORT_PATTERNS[moduleName],
          message: `Import from the ${moduleName} module's index.ts, not from its internals.`,
        })),
      },
    ],
  },
});

/** Unit conversions live in `time.constants.ts`; 1000 in other constants files is a ms/s factor. */
const timeConversionLiteralBan = {
  files: ['src/**/*.constants.ts'],
  ignores: ['src/common/constants/time.constants.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Literal[value=1000]',
        message:
          'Compose a unit from common/constants/time.constants.ts instead of writing 1000.',
      },
    ],
  },
};

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['src/generated/**'],
  }),
  { languageOptions: { globals: globals.node } },
  timeConversionLiteralBan,
  {
    files: ['src/**/*.ts'],
    // reason: src/contract reads `*.constants.ts` files directly, by design (Q-A4).
    ignores: ['src/modules/**', 'src/architecture/**', 'src/contract/**'],
    ...deepImportBan(moduleNames),
  },
  ...moduleNames.map((ownName) => ({
    files: [`src/modules/${ownName}/**/*.ts`],
    ...deepImportBan(moduleNames.filter((name) => name !== ownName)),
  })),
];
