import { FormAlert, SortableSheet, type SheetColumn } from '@abyss/form-commons';
import { LoadError, PageHeader, TableSkeleton } from '@components/PageStates';
import { rolePermissionsPath } from '@configs/App.routes';
import { useScreenText, type ScreenText } from '@configs/locales';
import type { Role } from '@features/access/Access.api';
import { isForbidden } from '@features/access/Access.errors';
import { useRolesQuery } from '@features/access/Access.queries';
import { Link } from 'react-router';

type RolesCopy = ScreenText<'access'>['access']['roles'];

/** `/roles`: every role, highest rank first; opens a role's matrix. */
export function RolesPage() {
  const copy = useScreenText('access').access.roles;
  const roles = useRolesQuery();

  return (
    <div className="grid gap-6">
      <PageHeader title={copy.title} description={copy.description} />
      {roles.isPending ? (
        <TableSkeleton label={copy.loading} />
      ) : roles.isError ? (
        isForbidden(roles.error) ? (
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            isRetrying={roles.isFetching}
            onRetry={() => void roles.refetch()}
          />
        )
      ) : roles.data.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <SortableSheet
          caption={copy.tableLabel}
          columns={roleColumnsOf(copy)}
          rows={roles.data}
          getRowId={(role) => role.id}
          getRowLabel={(role) => role.name}
        />
      )}
    </div>
  );
}

const roleColumnsOf = (copy: RolesCopy): readonly SheetColumn<Role>[] => [
  {
    key: 'name',
    header: copy.columns.name,
    rowHeader: true,
    renderCell: (role) => (
      <>
        <Link
          to={rolePermissionsPath(role.id)}
          aria-label={copy.open(role.name)}
          className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {role.name}
        </Link>
        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
          {role.slug}
        </span>
      </>
    ),
  },
  {
    key: 'rank',
    header: copy.columns.rank,
    align: 'right',
    renderCell: (role) => role.rank,
  },
  {
    key: 'accounts',
    header: copy.columns.accounts,
    align: 'right',
    renderCell: (role) => role.accountCount,
  },
  {
    key: 'type',
    header: copy.columns.type,
    renderCell: (role) => (role.isSystem ? copy.system : copy.custom),
  },
];
