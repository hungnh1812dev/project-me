import baseEslint from '@abyss/base-config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const WIRING_BAN = {
  group: ['**/AuthWiring.setup'],
  message: 'features/auth/AuthWiring.setup is for src/app/** only.',
};
const APP_BAN = {
  group: ['**/app', '**/app/**'],
  message: 'Features and lib never import from app/; app wires them.',
};
const API_CLIENT_BAN = {
  group: ['**/lib/Api.client'],
  allowTypeImports: true,
  message:
    'Features receive an axios client from app/ and never import lib/Api.client (type imports such as PageMeta are fine).',
};
const FEATURES_BAN = {
  group: ['**/features', '**/features/**'],
  message: 'lib/ never depends on features.',
};

const COPY_FILE_BAN = {
  group: ['**/config/copy/*.copy'],
  message:
    'Read text through COPY (config/Copy.constants); a section file belongs to config/copy/ only.',
};
const COPY_SIBLING_BAN = {
  regex: '^\\./(?!Common\\.copy$)[^/]+\\.copy$',
  message: 'A copy section file imports no other section; only Common.copy.',
};

const FEATURE_CONSTANTS_BAN = {
  group: ['**/features/*/*.constants'],
  message:
    'A feature constants file belongs to its feature; export what others need through its index.ts.',
};
const SIBLING_FEATURE_CONSTANTS_BAN = {
  regex: '^\\.\\./(?!lib/|config/)[^./][^/]*/[^/]+\\.constants$',
  message:
    'A feature constants file belongs to its feature; export what others need through its index.ts.',
};

const importBoundary = (files, patterns, ignores = []) => ({
  files,
  ignores,
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [...patterns, COPY_FILE_BAN] },
    ],
  },
});

// SPEC §2 import order, lowest first. A feature may import only from tiers
// below its own, and only through the other feature's index.ts.
const FEATURE_TIERS = [
  ['auth'],
  ['security'],
  ['content-types'],
  ['access'],
  ['media'],
  ['content', 'reviewer'],
];
const FEATURES_IMPORTING_NO_FEATURE = ['auth', 'content-types', 'status'];
const ALL_FEATURES = [...FEATURE_TIERS.flat(), 'status'];
// Tests name the exact module a consumer imports (vi.mock), so they may go deep.
const TEST_FILES = ['**/*.test.{ts,tsx}'];

const allowedFeaturesOf = (feature) => {
  if (FEATURES_IMPORTING_NO_FEATURE.includes(feature)) return [];
  const tierIndex = FEATURE_TIERS.findIndex((tier) => tier.includes(feature));
  return FEATURE_TIERS.slice(0, tierIndex).flat();
};

const featureOrderBoundary = (feature) => {
  const allowed = allowedFeaturesOf(feature);
  const forbidden = ALL_FEATURES.filter(
    (other) => other !== feature && !allowed.includes(other),
  );
  // A later config replaces earlier no-restricted-imports options, so repeat the base bans.
  const patterns = [
    WIRING_BAN,
    APP_BAN,
    API_CLIENT_BAN,
    SIBLING_FEATURE_CONSTANTS_BAN,
    {
      regex: '^\\.\\./[^./][^/]*/',
      message: 'Import another feature through its index.ts, not a deep path.',
    },
  ];
  if (forbidden.length > 0) {
    patterns.push({
      regex: `^\\.\\./(${forbidden.join('|')})$`,
      message: `${feature} may not import this feature (SPEC §2 order).`,
    });
  }
  return importBoundary([`src/features/${feature}/**`], patterns, TEST_FILES);
};

const NO_DATE_FORMATTER = {
  selector:
    "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
  message: 'Format dates through lib/DateFormat.rules.ts.',
};
const NO_RAW_RADIO = {
  selector:
    "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='radio']",
  message: 'Use Radio from @abyss/form-commons.',
};
const NO_RAW_TEXTAREA = {
  selector: "JSXOpeningElement[name.name='textarea']",
  message: 'Use Textarea from @abyss/form-commons.',
};
const NO_NATIVE_DIALOG = {
  selector: "JSXOpeningElement[name.name='dialog']",
  message: 'Use Dialog from @abyss/form-commons.',
};
const NO_LITERAL_QUERY_KEY = {
  selector: "Property[key.name='queryKey'] > ArrayExpression",
  message:
    'Query keys come from the feature owner (*.queries.ts, useSetupStatus.query.ts), not literals.',
};
const QUERY_KEY_OWNERS = [
  'src/**/*.queries.ts',
  'src/**/useSetupStatus.query.ts',
];

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    fileNames: {
      frameworkFileNames: ['index.ts', 'main.tsx'],
      testSuffixes: ['test'],
    },
  }),
  reactHooks.configs.flat['recommended-latest'],
  { languageOptions: { globals: globals.browser } },
  importBoundary(
    ['src/**'],
    [WIRING_BAN, FEATURE_CONSTANTS_BAN],
    ['src/app/**', 'src/FeatureTiers.architecture.test.ts'],
  ),
  importBoundary(['src/features/**'], [WIRING_BAN, APP_BAN, API_CLIENT_BAN]),
  importBoundary(['src/app/**'], [FEATURE_CONSTANTS_BAN]),
  importBoundary(['src/lib/**'], [WIRING_BAN, APP_BAN, FEATURES_BAN]),
  ...ALL_FEATURES.map(featureOrderBoundary),
  // Tests build a real client with createApiClient, so only they may reach lib/Api.client.
  importBoundary(
    TEST_FILES.map((pattern) => `src/features/${pattern}`),
    [WIRING_BAN, APP_BAN, SIBLING_FEATURE_CONSTANTS_BAN],
  ),
  {
    files: ['src/**'],
    ignores: [
      ...TEST_FILES,
      ...QUERY_KEY_OWNERS,
      'src/lib/DateFormat.rules.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        NO_DATE_FORMATTER,
        NO_LITERAL_QUERY_KEY,
        NO_RAW_RADIO,
        NO_RAW_TEXTAREA,
        NO_NATIVE_DIALOG,
      ],
    },
  },
  {
    files: ['src/config/copy/*.copy.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [COPY_SIBLING_BAN] }],
    },
  },
  {
    files: QUERY_KEY_OWNERS,
    rules: {
      'no-restricted-syntax': [
        'error',
        NO_DATE_FORMATTER,
        NO_RAW_RADIO,
        NO_RAW_TEXTAREA,
        NO_NATIVE_DIALOG,
      ],
    },
  },
];
