import { Link } from 'react-router';

import { FormAlert } from '@abyss/form-commons';
import { COPY } from '../../config/copy.constants';
import { rolePermissionsPath } from '../../config/routes';
import { isForbidden } from './access-error';
import { useRolesQuery } from './access-queries';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';

const copy = COPY.access.roles;

/** `/roles` (T18): every role, highest rank first; opens a role's matrix. */
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
            retrying={roles.isFetching}
            onRetry={() => void roles.refetch()}
          />
        )
      ) : roles.data.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="relative overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{copy.tableLabel}</caption>
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.name}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {copy.columns.rank}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {copy.columns.accounts}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {copy.columns.type}
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.data.map((role) => (
                <tr key={role.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link
                      to={rolePermissionsPath(role.id)}
                      aria-label={copy.open(role.name)}
                      className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {role.name}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {role.slug}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {role.rank}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {role.accountCount}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {role.isSystem ? copy.system : copy.custom}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
