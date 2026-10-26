import { SYSTEM_ROLES } from '../../src/modules/access/domain/SystemRoles.entity';
import {
  assertPinnedPathsExist,
  listSourceFiles,
} from './ImportGraph.analyzer';
import { findRoleSlugLiterals } from './RoleSlugLiterals.analyzer';
import {
  NON_ROLE_LITERAL_FILES,
  SYSTEM_ROLES_TABLE_FILE,
  SRC_ROOT,
} from './SourcePaths.constants';

/**
 * SPEC D6 (R1-05): the system role slugs live in one table,
 * `modules/access/domain/SystemRoles.entity.ts`. Code elsewhere uses the exported
 * constants, never a quoted slug. A slug in quotes is allowed only when it is
 * not a role: an actor kind (`'anonymous'`, `'reviewer'`) or a route segment,
 * module name or handler label in the files listed below.
 */
const GENERATED_DIRECTORY = 'generated';

// NON_ROLE_LITERAL_FILES: files whose quoted slugs name routes, modules or handler labels.

const ROLE_SLUGS = SYSTEM_ROLES.map((role) => role.slug);

describe('system role slugs (D6)', () => {
  const sources = listSourceFiles(SRC_ROOT).filter(
    ({ file }) =>
      file !== SYSTEM_ROLES_TABLE_FILE &&
      !file.startsWith(GENERATED_DIRECTORY) &&
      !NON_ROLE_LITERAL_FILES.includes(file),
  );

  it('scans the source tree', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('quotes no role slug outside the roles table', () => {
    const offenders = sources.flatMap(({ file, text }) =>
      findRoleSlugLiterals(text, ROLE_SLUGS).map(
        ({ slug, line }) => `${file}:${line}: '${slug}'`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('the files exempted as non-role literals exist', () => {
    expect(() =>
      assertPinnedPathsExist(SRC_ROOT, [
        SYSTEM_ROLES_TABLE_FILE,
        ...NON_ROLE_LITERAL_FILES,
      ]),
    ).not.toThrow();
  });
});

describe('findRoleSlugLiterals', () => {
  const scan = (code: string) =>
    findRoleSlugLiterals(code, ROLE_SLUGS).map(({ slug }) => slug);

  it('finds a plain role check', () => {
    expect(scan("if (role.slug === 'admin') grant();")).toEqual(['admin']);
  });

  it('finds a slug after a URL string on the same line', () => {
    expect(
      scan("const u = 'https://x'; if (role.slug === 'admin') grant();"),
    ).toEqual(['admin']);
  });

  it('finds a case of a switch on the role slug', () => {
    expect(scan("switch (role.slug) { case 'reviewer': return 1; }")).toEqual([
      'reviewer',
    ]);
  });

  it('finds a slug on the line next to an anonymous literal', () => {
    expect(
      scan("const a = 'anonymous';\nif (role.slug === 'owner') grant();"),
    ).toEqual(['owner']);
  });

  it('ignores slugs in comments', () => {
    expect(scan("// the 'owner' role\n/* 'admin' */ const a = 1;")).toEqual([]);
  });

  it('allows actor kinds by code context', () => {
    expect(
      scan(`
        type A = { kind: 'reviewer' };
        const b = { kind: 'reviewer' };
        const c = actor.kind === 'reviewer';
        switch (actor.kind) { case 'reviewer': break; }
        const d = ['anonymous', 'reviewer'] as const satisfies readonly ActorKind[];
      `),
    ).toEqual([]);
  });
});
