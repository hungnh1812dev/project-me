/**
 * ADR 0008 / SPEC §5: file names are `<PascalName>.<function>.ts`. This file
 * is the one place that lists the allowed function words and the files that
 * do not follow the rule yet. A new function word is one entry in
 * `FILE_FUNCTION_WORDS`; a renamed file leaves `KNOWN_FILE_NAME_EXCEPTIONS`.
 */
export const FILE_FUNCTION_WORDS: readonly string[] = [
  'setup',
  'module',
  'controller',
  'requests',
  'routes',
  'guard',
  'decorator',
  'middleware',
  'filter',
  'service',
  'port',
  'entity',
  'rules',
  'errors',
  'repository',
  'adapter',
  'client',
  'command',
  'job',
  'store',
  'strategy',
  'resolver',
  'executor',
  'constants',
  'fixture',
  'architecture',
  'analyzer',
  'integration',
  'contract',
  'schema',
];

/** Names fixed by a framework or tool, kept as they are. */
export const FRAMEWORK_FILE_NAMES: readonly string[] = ['index.ts', 'main.ts'];

/** Directories under the package root that the guard scans. */
export const SCANNED_DIRECTORIES: readonly string[] = ['src', 'test'];

/** Generated code is not named by hand. */
export const SKIPPED_DIRECTORIES: readonly string[] = ['src/generated'];

export const FOLDER_NAME_SHAPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Paths relative to `apps/cms-api`. Only shrinks: a conforming or missing entry fails the guard. */
export const KNOWN_FILE_NAME_EXCEPTIONS: readonly string[] = [
  'src/modules/access/domain/AccessErrorBodies.spec.ts',
  'src/modules/access/domain/PolicyEvaluator.spec.ts',
  'src/modules/access/domain/PolicyEvaluator.ts',
  'src/modules/access/domain/RecordSerializer.spec.ts',
  'src/modules/access/domain/RecordSerializer.ts',
  'src/modules/access/record-serializer.architecture.spec.ts',
  'src/modules/content-engine/cli/generate.spec.ts',
  'src/modules/content-engine/cli/generate.ts',
  'src/modules/content-engine/cli/migrate.ts',
  'src/modules/graphql/cli/print-schema.spec.ts',
  'src/modules/graphql/cli/print-schema.ts',
  'src/modules/graphql/graphql.architecture.spec.ts',
  'src/modules/identity/auth-constants.pin.spec.ts',
  'src/modules/media/adapters/Storage.adapters.spec.ts',
  'test/fixtures/access.fixture.ts',
  'test/fixtures/content-registry.fixture.ts',
  'test/fixtures/content-unit.fixture.ts',
  'test/fixtures/core-db.fixture.ts',
  'test/fixtures/env.fixture.ts',
  'test/fixtures/management.fixture.ts',
  'test/fixtures/masking.fixture.ts',
  'test/fixtures/media.fixture.ts',
  'test/fixtures/multipart.ts',
  'test/fixtures/postgres.fixture.ts',
  'test/fixtures/test-app.ts',
  'test/integration/access-guard.spec.ts',
  'test/integration/accounts-roles.spec.ts',
  'test/integration/api-tokens.spec.ts',
  'test/integration/auth-me-permissions.spec.ts',
  'test/integration/auth.spec.ts',
  'test/integration/bootstrap.spec.ts',
  'test/integration/content-migrations.spec.ts',
  'test/integration/content-repository.spec.ts',
  'test/integration/content-transaction-runner.spec.ts',
  'test/integration/content-types.spec.ts',
  'test/integration/cors.spec.ts',
  'test/integration/documents-bulk.spec.ts',
  'test/integration/documents-presence.spec.ts',
  'test/integration/documents-publish.spec.ts',
  'test/integration/documents-read.spec.ts',
  'test/integration/documents-write.spec.ts',
  'test/integration/field-masking.spec.ts',
  'test/integration/global-setup.ts',
  'test/integration/global-teardown.ts',
  'test/integration/graphql.spec.ts',
  'test/integration/health.spec.ts',
  'test/integration/http-pipeline.spec.ts',
  'test/integration/identity-bootstrap.spec.ts',
  'test/integration/jest.setup.ts',
  'test/integration/media-delete.spec.ts',
  'test/integration/media-document-refs.spec.ts',
  'test/integration/media-update.spec.ts',
  'test/integration/media.spec.ts',
  'test/integration/owner-setup.spec.ts',
  'test/integration/password.spec.ts',
  'test/integration/rate-limit.spec.ts',
  'test/integration/reviewer.spec.ts',
  'test/integration/role-permissions-seed.spec.ts',
  'test/integration/route-snapshot.spec.ts',
  'test/integration/security-headers.spec.ts',
  'test/integration/seed-account.spec.ts',
  'test/integration/transaction-runner.spec.ts',
  'test/integration/two-factor.spec.ts',
];
