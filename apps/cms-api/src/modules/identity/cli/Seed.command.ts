import { loadDatabaseConfig } from '../../../config/AppConfig.setup';
import { openIdentityCli } from './IdentityCli.setup';

/**
 * `db:seed` (also the last step of `db:migrate`): idempotent system roles
 * seed, then default permissions for roles that have none.
 */
async function main(): Promise<void> {
  const database = loadDatabaseConfig(process.env);
  const cli = openIdentityCli({ database });
  try {
    const inserted = await cli.roleSeed.seedSystemRoles();
    process.stdout.write(
      inserted.length > 0
        ? `Seeded system roles: ${inserted.join(', ')}.\n`
        : 'System roles already seeded.\n',
    );
    const permissions = await cli.roleSeed.seedRolePermissions();
    process.stdout.write(
      permissions.length > 0
        ? `Seeded default permissions: ${permissions.join(', ')}.\n`
        : 'Default permissions already seeded.\n',
    );
  } finally {
    await cli.close();
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
