import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import {
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from '../../src/modules/access/domain/SystemRoles.entity';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/Access.fixture';

const CONCURRENT_RUNS = 4;

describe('default role permissions seed (Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let template: Awaited<ReturnType<typeof createCoreTemplate>>;
  const handles: PrismaHandle[] = [];

  beforeAll(async () => {
    postgres = await startPostgres();
    template = await createCoreTemplate(postgres.getConnectionUri());
  });

  afterAll(async () => {
    await Promise.all(handles.map((handle) => handle.close()));
    await postgres?.stop();
  });

  async function database() {
    const handle = openPrisma(await template.fresh());
    handles.push(handle);
    await seedSystemRoles(handle.prisma);
    return handle.prisma;
  }

  async function rowsBySlug(prisma: PrismaHandle['prisma']) {
    const rows = await prisma.permission.findMany({
      select: { subject: true, action: true, role: { select: { slug: true } } },
    });
    const result = new Map<string, string[]>();
    for (const row of rows) {
      const list = result.get(row.role.slug) ?? [];
      list.push(`${row.subject}:${row.action}`);
      result.set(row.role.slug, list);
    }
    return result;
  }

  function expected(slug: (typeof SYSTEM_ROLES)[number]['slug']): string[] {
    return DEFAULT_ROLE_PERMISSIONS[slug]
      .flatMap(({ subject, actions }) => actions.map((a) => `${subject}:${a}`))
      .sort();
  }

  it('seeds the decided matrix with all fields and no conditions', async () => {
    const prisma = await database();
    expect((await seedRolePermissions(prisma)).sort()).toEqual(
      ['admin', 'editor', 'public', 'reviewer'].sort(),
    );
    const bySlug = await rowsBySlug(prisma);
    for (const { slug } of SYSTEM_ROLES) {
      expect([slug, (bySlug.get(slug) ?? []).sort()]).toEqual([
        slug,
        expected(slug),
      ]);
    }
    const lists = await prisma.permission.findMany({
      select: { readableFields: true, writableFields: true, conditions: true },
    });
    expect(lists.length).toBeGreaterThan(0);
    for (const row of lists) {
      expect(row).toEqual({
        readableFields: null,
        writableFields: null,
        conditions: null,
      });
    }
  });

  it('is idempotent and never touches a role that already has rows', async () => {
    const prisma = await database();
    const editor = await prisma.role.findUniqueOrThrow({
      where: { slug: 'editor' },
    });
    await prisma.permission.create({
      data: { roleId: editor.id, subject: 'media', action: 'read' },
    });
    await seedRolePermissions(prisma);
    expect(await seedRolePermissions(prisma)).toEqual([]);
    const bySlug = await rowsBySlug(prisma);
    expect(bySlug.get('editor')).toEqual(['media:read']);
    expect(bySlug.get('admin')?.sort()).toEqual(expected('admin'));
  });

  it('concurrent runs seed each role once', async () => {
    const prisma = await database();
    await Promise.all(
      Array.from({ length: CONCURRENT_RUNS }, () =>
        seedRolePermissions(prisma),
      ),
    );
    const bySlug = await rowsBySlug(prisma);
    expect(bySlug.get('admin')?.sort()).toEqual(expected('admin'));
  });
});
