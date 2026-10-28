import { Link } from 'react-router';

import {
  FormAlert,
  type SheetColumn,
  SortableSheet,
} from '@abyss/form-commons';
import { COPY } from '../../config/Copy.constants';
import { rolePermissionsPath } from '../../config/App.routes';
import type { Role } from './Access.api';
import { isForbidden } from './Access.errors';
import { useRolesQuery } from './Access.queries';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';

const copy = COPY.access.roles;

/** `/roles`: every role, highest rank first; opens a role's matrix. */
export function RolesPage() {
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
          columns={ROLE_COLUMNS}
          rows={roles.data}
          getRowId={(role) => role.id}
          getRowLabel={(role) => role.name}
        />
      )}
    </div>
  );
}

const ROLE_COLUMNS: readonly SheetColumn<Role>[] = [
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
