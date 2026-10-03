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

import { useAppSelector } from '@/app/hooks';
import { GatedButton } from '@/components/form/GatedButton';
import { useCan, useRoleLevel } from '@/features/auth/hooks/useCan';
import { selectCurrentUser } from '@/features/auth/store/selectors';
import { ListState } from '@/features/settings/components/ListState';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { SearchField } from '@/features/settings/components/SearchField';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';
import { useRoles } from '@/features/settings/hooks/useRoles';
import { useUsers } from '@/features/settings/hooks/useUsers';
import { assignableRoles, usersWithRoles, type UserRow } from '@/features/settings/roleHierarchy';
import { filterBySearch } from '@/features/settings/search';

import { ChangeRoleDialog } from './users/ChangeRoleDialog';
import { DeleteUserDialog } from './users/DeleteUserDialog';

const NOUN = { one: 'user', other: 'users' };
const SEARCH_FIELDS = ['name', 'username', 'email'] as const;
const DATE = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

interface RowProps {
  row: UserRow;
  isSelf: boolean;
  /** The highest level the actor may assign, `undefined` when none. */
  topAssignableLevel: number | undefined;
  onChangeRole: (row: UserRow) => void;
  onDelete: (row: UserRow) => void;
}

/** One user row. Its actions are gated per row: self, hierarchy and permission (AC-5, AC-14). */
const UserTableRow: React.FC<RowProps> = ({
  row,
  isSelf,
  topAssignableLevel,
  onChangeRole,
  onDelete,
}) => {
  const { user, level } = row;
  const assignAttrs = useMemo(
    () => ({ targetUserId: user.documentId, targetLevel: level, newRoleLevel: topAssignableLevel }),
    [user.documentId, level, topAssignableLevel],
  );
  const deleteAttrs = useMemo(
    () => ({ targetUserId: user.documentId, targetLevel: level }),
    [user.documentId, level],
  );
  const canAssign = useCan('assign_role', 'user', assignAttrs);
  const canDelete = useCan('delete', 'user', deleteAttrs);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          {user.name}
          {isSelf && <Badge variant="secondary">You</Badge>}
        </span>
      </TableCell>
      <TableCell>{user.username}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <Badge variant={user.verified ? 'secondary' : 'outline'}>
          {user.verified ? 'Verified' : 'Not verified'}
        </Badge>
      </TableCell>
      <TableCell className={row.role ? undefined : 'text-muted-foreground'}>
        {row.roleName}
      </TableCell>
      <TableCell>
        <time dateTime={user.createdAt}>{DATE.format(new Date(user.createdAt))}</time>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <GatedButton
            decision={canAssign}
            variant="outline"
            size="sm"
            aria-label={`Change role for ${user.email}`}
            onClick={() => onChangeRole(row)}
          >
            Change role
          </GatedButton>
          <GatedButton
            decision={canDelete}
            variant="outline"
            size="sm"
            aria-label={`Delete ${user.email}`}
            onClick={() => onDelete(row)}
          >
            Delete
          </GatedButton>
        </div>
      </TableCell>
    </TableRow>
  );
};
UserTableRow.displayName = 'UserTableRow';

type Target = { kind: 'role' | 'delete'; row: UserRow; session: number };

/**
 * `/admin/settings/users` (gated by `user:read`): every user with its joined role (AC-13), a
 * client-side search (AC-4), and the gated Change role and Delete actions (AC-15, AC-16). Names and
 * passwords are not editable here (AC-17).
 */
const UsersPage: React.FC = () => {
  const users = useUsers();
  const roles = useRoles();
  const actorLevel = useRoleLevel();
  const meId = useAppSelector(selectCurrentUser)?.documentId;
  const { message, announce } = useAnnouncer();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  const total = users.data?.length ?? 0;
  const visible = useMemo(
    () => usersWithRoles(filterBySearch(users.data ?? [], search, SEARCH_FIELDS), roles.data),
    [users.data, roles.data, search],
  );
  const assignable = useMemo(
    () => assignableRoles(roles.data ?? [], actorLevel),
    [roles.data, actorLevel],
  );
  // Wait for R1 when it is allowed, so rows never flash "Unknown" (AC-13).
  const isPending = users.isPending || (roles.decision.allowed && roles.isPending);

  const openDialog = (kind: Target['kind']) => (row: UserRow) => {
    setTarget((previous) => ({ kind, row, session: (previous?.session ?? 0) + 1 }));
    setOpen(true);
  };

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Assign roles and remove accounts. People edit their own name from their profile.
        </p>
      </header>
      <SearchField
        noun={NOUN}
        value={search}
        onChange={setSearch}
        count={visible.length}
        className="max-w-sm"
      />
      <ListState
        isPending={isPending}
        error={users.error}
        refetch={users.refetch}
        noun={NOUN}
        total={total}
        visible={visible.length}
        search={search}
      >
        <div
          role="region"
          aria-label="Users table"
          tabIndex={0}
          className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_[data-slot=table-container]]:overflow-visible"
        >
          <Table>
            <TableCaption className="sr-only">Users</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Username</TableHead>
                <TableHead scope="col">Email</TableHead>
                <TableHead scope="col">Verified</TableHead>
                <TableHead scope="col">Role</TableHead>
                <TableHead scope="col">Created</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <UserTableRow
                  key={row.user.documentId}
                  row={row}
                  isSelf={row.user.documentId === meId}
                  topAssignableLevel={assignable[0]?.level}
                  onChangeRole={openDialog('role')}
                  onDelete={openDialog('delete')}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </ListState>
      {target?.kind === 'role' && (
        <ChangeRoleDialog
          key={target.session}
          row={target.row}
          roles={assignable}
          open={open}
          onOpenChange={setOpen}
          onChanged={announce}
        />
      )}
      {target?.kind === 'delete' && (
        <DeleteUserDialog
          key={target.session}
          row={target.row}
          open={open}
          onOpenChange={setOpen}
          onDeleted={announce}
        />
      )}
      <LiveRegion message={message} />
    </section>
  );
};
UsersPage.displayName = 'UsersPage';

export default UsersPage;
