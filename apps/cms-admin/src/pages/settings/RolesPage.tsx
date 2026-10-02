import { useId, useMemo, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import { GatedButton } from '@/components/form/GatedButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCan } from '@/features/auth/hooks/useCan';
import type { Role } from '@/features/auth/types';
import { ListState } from '@/features/settings/components/ListState';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { SearchField } from '@/features/settings/components/SearchField';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';
import { useRoles } from '@/features/settings/hooks/useRoles';
import { groupSlugsByResource } from '@/features/settings/permissionTree';
import { filterBySearch } from '@/features/settings/search';
import { cn } from '@/utils/cn';

import { DeleteRoleDialog } from './roles/DeleteRoleDialog';
import { RoleFormDialog } from './roles/RoleFormDialog';

const NOUN = { one: 'role', other: 'roles' };
const SEARCH_FIELDS = ['name', 'slug'] as const;
const COLUMNS = 5;

const permissionCount = (count: number) => `${count} ${count === 1 ? 'permission' : 'permissions'}`;

/** Level descending, then name ignoring case (AC-18). */
const byLevelThenName = (a: Role, b: Role) =>
  b.level - a.level || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** A role's permissions grouped by resource, read-only (AC-18). */
const RolePermissions: React.FC<{ id: string; role: Role }> = ({ id, role }) => {
  const groups = groupSlugsByResource(role.permissions);
  return (
    <div
      id={id}
      role="region"
      aria-label={`${role.name} permissions`}
      className="flex flex-col gap-3 py-1"
    >
      {groups.length === 0 ? (
        <p className="text-muted-foreground">This role grants no permissions.</p>
      ) : (
        groups.map((group) => (
          <div key={group.resource} className="flex flex-col gap-1.5">
            <p id={`${id}-${group.resource}`} className="font-mono text-xs font-medium">
              {group.resource}
            </p>
            <ul aria-labelledby={`${id}-${group.resource}`} className="flex flex-wrap gap-1.5">
              {group.slugs.map((slug) => (
                <li key={slug}>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{slug}</code>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
};
RolePermissions.displayName = 'RolePermissions';

interface RowProps {
  role: Role;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

/** One role, its gated actions (AC-5, AC-20, AC-21) and, when expanded, its permissions. */
const RoleTableRow: React.FC<RowProps> = ({ role, expanded, onToggle, onEdit, onDelete }) => {
  const detailsId = useId();
  const attrs = useMemo(() => ({ isDefault: role.isDefault }), [role.isDefault]);
  const canUpdate = useCan('update', 'role', attrs);
  const canDelete = useCan('delete', 'role', attrs);

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <span className="flex items-center gap-2">
            {role.name}
            {role.isDefault && <Badge variant="secondary">Default</Badge>}
          </span>
        </TableCell>
        <TableCell>
          <code className="font-mono text-sm">{role.slug}</code>
        </TableCell>
        <TableCell className="tabular-nums">{role.level}</TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={onToggle}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn('transition-transform', expanded && 'rotate-90')}
            />
            <span className="sr-only">{`${role.name}:`}</span>{' '}
            {permissionCount(role.permissions.length)}
          </Button>
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-2">
            <GatedButton
              decision={canUpdate}
              variant="outline"
              size="sm"
              aria-label={`Edit ${role.name}`}
              onClick={() => onEdit(role)}
            >
              Edit
            </GatedButton>
            <GatedButton
              decision={canDelete}
              variant="outline"
              size="sm"
              aria-label={`Delete ${role.name}`}
              onClick={() => onDelete(role)}
            >
              Delete
            </GatedButton>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow data-details="" className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={COLUMNS} className="whitespace-normal">
            <RolePermissions id={detailsId} role={role} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
RoleTableRow.displayName = 'RoleTableRow';

type Target = { kind: 'create' | 'edit' | 'delete'; role?: Role; session: number };

/**
 * `/admin/settings/roles` (gated by `role:read`): every role sorted by level then name, with slug,
 * level, permission count and a Default badge; a row expands to its permissions grouped by
 * resource (AC-18). A client-side search covers name and slug (AC-4), and New, Edit and Delete are
 * gated (AC-5, AC-19 to AC-21). No level-hierarchy rule applies to roles (D4).
 */
const RolesPage: React.FC = () => {
  const roles = useRoles();
  const canCreate = useCan('create', 'role');
  const { message, announce } = useAnnouncer();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  const total = roles.data?.length ?? 0;
  const visible = useMemo(
    () => filterBySearch(roles.data ?? [], search, SEARCH_FIELDS).sort(byLevelThenName),
    [roles.data, search],
  );

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const openDialog = (kind: Target['kind']) => (role?: Role) => {
    setTarget((previous) => ({ kind, role, session: (previous?.session ?? 0) + 1 }));
    setOpen(true);
  };

  const newButton = (
    <GatedButton decision={canCreate} onClick={() => openDialog('create')()}>
      New role
    </GatedButton>
  );

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
          <p className="text-sm text-muted-foreground">
            Bundle permissions into roles and set the level each one manages from.
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
        isPending={roles.isPending}
        error={roles.error}
        refetch={roles.refetch}
        noun={NOUN}
        total={total}
        visible={visible.length}
        search={search}
        emptyAction={newButton}
      >
        <div
          role="region"
          aria-label="Roles table"
          tabIndex={0}
          className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_[data-slot=table-container]]:overflow-visible"
        >
          <Table>
            <TableCaption className="sr-only">Roles</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Slug</TableHead>
                <TableHead scope="col">Level</TableHead>
                <TableHead scope="col">Permissions</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((role) => (
                <RoleTableRow
                  key={role.documentId}
                  role={role}
                  expanded={expanded.has(role.documentId)}
                  onToggle={() => toggle(role.documentId)}
                  onEdit={openDialog('edit')}
                  onDelete={openDialog('delete')}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
      {(target?.kind === 'create' || target?.kind === 'edit') && (
        <RoleFormDialog
          key={target.session}
          role={target.role}
          open={open}
          onOpenChange={setOpen}
          onSaved={announce}
        />
      )}
      {target?.kind === 'delete' && target.role && (
        <DeleteRoleDialog
          key={target.session}
          role={target.role}
          open={open}
          onOpenChange={setOpen}
          onDeleted={announce}
        />
      )}
      <LiveRegion message={message} />
    </section>
  );
};
RolesPage.displayName = 'RolesPage';

export default RolesPage;
