import { useMemo, useState } from 'react';

import { Badge } from '@repo/ui/components/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { GatedButton } from '@repo/ui/form/GatedButton';

import { useCan } from '@/features/auth/hooks/useCan';
import type { Decision } from '@/features/auth/permissions/policies';
import { ListState } from '@/features/settings/components/ListState';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { SearchField } from '@/features/settings/components/SearchField';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';
import { usePermissions } from '@/features/settings/hooks/usePermissions';
import { filterBySearch } from '@/features/settings/search';
import type { Permission } from '@/features/settings/types';

import { DeletePermissionDialog } from './permissions/DeletePermissionDialog';
import { PermissionFormDialog } from './permissions/PermissionFormDialog';

const NOUN = { one: 'permission', other: 'permissions' };
const SEARCH_FIELDS = ['slug', 'name', 'description'] as const;

interface ResourceGroup {
  resource: string;
  permissions: Permission[];
}

/** Groups by the slug's resource (before the first `:`), groups and rows sorted by slug (AC-24). */
function groupByResource(permissions: readonly Permission[]): ResourceGroup[] {
  const groups = new Map<string, Permission[]>();
  for (const permission of [...permissions].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const resource = permission.slug.split(':')[0] ?? permission.slug;
    groups.set(resource, [...(groups.get(resource) ?? []), permission]);
  }
  return [...groups].map(([resource, items]) => ({ resource, permissions: items }));
}

interface GroupProps {
  group: ResourceGroup;
  canUpdate: Decision;
  canDelete: Decision;
  onEdit: (permission: Permission) => void;
  onDelete: (permission: Permission) => void;
}

/** One resource as a collapsible section with its count and table (AC-12, AC-24). */
const PermissionGroup: React.FC<GroupProps> = ({
  group,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}) => {
  const { resource, permissions } = group;
  const count = permissions.length;
  return (
    <details open className="group rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-h-10">
        <span className="font-mono">{resource}</span>
        <Badge variant="secondary">
          {count}
          <span className="sr-only"> {count === 1 ? NOUN.one : NOUN.other}</span>
        </Badge>
      </summary>
      <div
        role="region"
        aria-label={`${resource} permissions table`}
        tabIndex={0}
        className="overflow-x-auto border-t focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_[data-slot=table-container]]:overflow-visible"
      >
        <Table>
          <TableCaption className="sr-only">{`${resource} permissions`}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Slug</TableHead>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Description</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((permission) => (
              <TableRow key={permission.documentId}>
                <TableCell>
                  <code className="font-mono text-sm">{permission.slug}</code>
                </TableCell>
                <TableCell className="font-medium">{permission.name}</TableCell>
                <TableCell className="min-w-48 whitespace-normal text-muted-foreground">
                  {permission.description}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <GatedButton
                      decision={canUpdate}
                      variant="outline"
                      size="sm"
                      aria-label={`Edit ${permission.slug}`}
                      onClick={() => onEdit(permission)}
                    >
                      Edit
                    </GatedButton>
                    <GatedButton
                      decision={canDelete}
                      variant="outline"
                      size="sm"
                      aria-label={`Delete ${permission.slug}`}
                      onClick={() => onDelete(permission)}
                    >
                      Delete
                    </GatedButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
};
PermissionGroup.displayName = 'PermissionGroup';

type Target = {
  kind: 'create' | 'edit' | 'delete';
  permission?: Permission;
  session: number;
};

/**
 * `/admin/settings/permissions` (gated by `permission:read`): the catalog grouped by resource
 * (AC-24), a client-side search over slug, name and description (AC-4), and the gated New, Edit
 * and Delete actions (AC-5, AC-25 to AC-27).
 */
const PermissionsPage: React.FC = () => {
  const permissions = usePermissions();
  const canCreate = useCan('create', 'permission');
  const canUpdate = useCan('update', 'permission');
  const canDelete = useCan('delete', 'permission');
  const { message, announce } = useAnnouncer();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  const total = permissions.data?.length ?? 0;
  const visible = useMemo(
    () => filterBySearch(permissions.data ?? [], search, SEARCH_FIELDS),
    [permissions.data, search],
  );
  const groups = useMemo(() => groupByResource(visible), [visible]);

  const openDialog = (kind: Target['kind']) => (permission?: Permission) => {
    setTarget((previous) => ({ kind, permission, session: (previous?.session ?? 0) + 1 }));
    setOpen(true);
  };

  const newButton = (
    <GatedButton decision={canCreate} onClick={() => openDialog('create')()}>
      New permission
    </GatedButton>
  );

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Permissions</h1>
          <p className="text-sm text-muted-foreground">
            The permission catalog that roles and access tokens grant from.
          </p>
        </div>
        {newButton}
      </header>
      <SearchField
        noun={NOUN}
        value={search}
        onChange={setSearch}
        count={visible.length}
        className="max-w-sm"
      />
      <ListState
        isPending={permissions.isPending}
        error={permissions.error}
        refetch={permissions.refetch}
        noun={NOUN}
        total={total}
        visible={visible.length}
        search={search}
        emptyAction={newButton}
      >
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <PermissionGroup
              key={group.resource}
              group={group}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onEdit={openDialog('edit')}
              onDelete={openDialog('delete')}
            />
          ))}
        </div>
      </ListState>
      {(target?.kind === 'create' || target?.kind === 'edit') && (
        <PermissionFormDialog
          key={target.session}
          permission={target.permission}
          open={open}
          onOpenChange={setOpen}
          onSaved={announce}
        />
      )}
      {target?.kind === 'delete' && target.permission && (
        <DeletePermissionDialog
          key={target.session}
          permission={target.permission}
          open={open}
          onOpenChange={setOpen}
          onDeleted={announce}
        />
      )}
      <LiveRegion message={message} />
    </section>
  );
};
PermissionsPage.displayName = 'PermissionsPage';

export default PermissionsPage;
