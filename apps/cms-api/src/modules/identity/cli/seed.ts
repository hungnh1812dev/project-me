import { loadAppConfig } from '../../../config/app-config';
import { openPrisma } from '../../../infrastructure/database/prisma-client';
import { seedRolePermissions } from '../../access/role-permissions.seed';
import { seedSystemRoles } from '../system-roles.seed';

/**
 * `db:seed` (also the last step of `db:migrate`): idempotent system roles
 * seed, then default permissions for roles that have none (T14).
 */
async function main(): Promise<void> {
  const config = loadAppConfig(process.env);
  const { prisma, close } = openPrisma(config.database.url);
  try {
    const inserted = await seedSystemRoles(prisma);
    process.stdout.write(
      inserted.length > 0
        ? `Seeded system roles: ${inserted.join(', ')}.\n`
        : 'System roles already seeded.\n',
    );
    const permissions = await seedRolePermissions(prisma);
    process.stdout.write(
      permissions.length > 0
        ? `Seeded default permissions: ${permissions.join(', ')}.\n`
        : 'Default permissions already seeded.\n',
    );
  } finally {
    await close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
