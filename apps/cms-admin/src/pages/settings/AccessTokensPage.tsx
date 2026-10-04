import { useId, useMemo, useRef, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
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
import { Pagination } from '@repo/ui/form/Pagination';
import { SecretReveal } from '@repo/ui/form/SecretReveal';
import { cn } from '@repo/ui/lib/cn';

import { useCan } from '@/features/auth/hooks/useCan';
import { ListState } from '@/features/settings/components/ListState';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { SearchField } from '@/features/settings/components/SearchField';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';
import { useAccessTokens } from '@/features/settings/hooks/useAccessTokens';
import { useListPaging } from '@/features/settings/hooks/useListPaging';
import { groupSlugsByResource } from '@/features/settings/permissionTree';
import { filterBySearch } from '@/features/settings/search';
import type { AccessToken } from '@/features/settings/types';

import { DeleteTokenDialog } from './access-tokens/DeleteTokenDialog';
import { RevokeTokenDialog } from './access-tokens/RevokeTokenDialog';
import { TokenFormDialog } from './access-tokens/TokenFormDialog';

const NOUN = { one: 'access token', other: 'access tokens' };
const SEARCH_FIELDS = ['name'] as const;
const COLUMNS = 6;
const DATE = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

const permissionCount = (count: number) => `${count} ${count === 1 ? 'permission' : 'permissions'}`;

/** "Never", the expiry date, or an "Expired" badge with the date once it has passed (AC-28). */
const Expiry: React.FC<{ expiresAt: string | null; now: number }> = ({ expiresAt, now }) => {
  if (expiresAt === null) return <span className="text-muted-foreground">Never</span>;
  const date = new Date(expiresAt);
  const label = DATE.format(date);
  if (date.getTime() > now) return <span>{label}</span>;
  return (
    <span className="flex items-center gap-2">
      <Badge variant="outline" className="border-destructive text-destructive">
        Expired
      </Badge>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
};
Expiry.displayName = 'Expiry';

/** A token's permissions grouped by resource, read-only (AC-28). */
const TokenPermissions: React.FC<{ id: string; token: AccessToken }> = ({ id, token }) => {
  const groups = groupSlugsByResource(token.permissions);
  return (
    <div
      id={id}
      role="region"
      aria-label={`${token.name} permissions`}
      className="flex flex-col gap-3 py-1"
    >
      {groups.length === 0 ? (
        <p className="text-muted-foreground">This token grants no permissions.</p>
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
TokenPermissions.displayName = 'TokenPermissions';

interface RowProps {
  token: AccessToken;
  /** When the page loaded, to tell expired tokens apart. */
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onRevoke: (token: AccessToken) => void;
  onDelete: (token: AccessToken) => void;
}

/** One token, its gated actions (AC-5, AC-31, AC-32) and, when expanded, its permissions. */
const TokenTableRow: React.FC<RowProps> = ({
  token,
  now,
  expanded,
  onToggle,
  onRevoke,
  onDelete,
}) => {
  const detailsId = useId();
  const canRevoke = useCan('revoke', 'api_token');
  const canDelete = useCan('delete', 'api_token');

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{token.name}</TableCell>
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
            <span className="sr-only">{`${token.name}:`}</span>{' '}
            {permissionCount(token.permissions.length)}
          </Button>
        </TableCell>
        <TableCell>
          <Expiry expiresAt={token.expiresAt} now={now} />
        </TableCell>
        <TableCell className="text-muted-foreground">
          {DATE.format(new Date(token.createdAt))}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {DATE.format(new Date(token.updatedAt))}
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-2">
            <GatedButton
              decision={canRevoke}
              variant="outline"
              size="sm"
              aria-label={`Revoke ${token.name}`}
              onClick={() => onRevoke(token)}
            >
              Revoke
            </GatedButton>
            <GatedButton
              decision={canDelete}
              variant="outline"
              size="sm"
              aria-label={`Delete ${token.name}`}
              onClick={() => onDelete(token)}
            >
              Delete
            </GatedButton>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow data-details="" className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={COLUMNS} className="whitespace-normal">
            <TokenPermissions id={detailsId} token={token} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
TokenTableRow.displayName = 'TokenTableRow';

type Target = { kind: 'create' | 'revoke' | 'delete'; token?: AccessToken; session: number };

/** The secret on screen and the message to announce once it is dismissed. */
type Reveal = { secret: string; message: string };

/**
 * `/admin/settings/access-tokens` (gated by `api_token:read`): every token with its name, an
 * expandable permission count, expiry and dates (AC-28). A client-side search covers name (AC-4),
 * and the list pages 10 tokens at a time with the page in the URL (Phase 6 AC-21).
 * New, Revoke and Delete are gated (AC-5). Create and Revoke end in the SecretReveal (AC-30): the
 * secret lives only in this page's state until Done clears it, and the success message is announced
 * then, once the modal no longer hides the page's live region (AC-33).
 */
const AccessTokensPage: React.FC = () => {
  const tokens = useAccessTokens();
  const canCreate = useCan('create', 'api_token');
  const { message, announce } = useAnnouncer();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [now] = useState(Date.now);

  const total = tokens.data?.length ?? 0;
  const visible = useMemo(
    () => filterBySearch(tokens.data ?? [], search, SEARCH_FIELDS),
    [tokens.data, search],
  );

  const paging = useListPaging(tokens.data ? visible : undefined, search);

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const openDialog = (kind: Target['kind']) => (token?: AccessToken) => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTarget((previous) => ({ kind, token, session: (previous?.session ?? 0) + 1 }));
    setOpen(true);
  };

  const done = () => {
    if (reveal) announce(reveal.message);
    setReveal(null);
  };

  const newButton = (
    <GatedButton decision={canCreate} onClick={() => openDialog('create')()}>
      New token
    </GatedButton>
  );

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Access tokens</h1>
          <p className="text-sm text-muted-foreground">
            Issue API keys for scripts and services, each limited to the permissions it needs.
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
        isPending={tokens.isPending}
        error={tokens.error}
        refetch={tokens.refetch}
        noun={NOUN}
        total={total}
        visible={visible.length}
        search={search}
        emptyAction={newButton}
      >
        <div className="flex flex-col gap-4">
          <div
            role="region"
            aria-label="Access tokens table"
            tabIndex={0}
            className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_[data-slot=table-container]]:overflow-visible"
          >
            <Table>
              <TableCaption className="sr-only">Access tokens</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Permissions</TableHead>
                  <TableHead scope="col">Expires</TableHead>
                  <TableHead scope="col">Created</TableHead>
                  <TableHead scope="col">Updated</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paging.rows.map((token) => (
                  <TokenTableRow
                    key={token.documentId}
                    token={token}
                    now={now}
                    expanded={expanded.has(token.documentId)}
                    onToggle={() => toggle(token.documentId)}
                    onRevoke={openDialog('revoke')}
                    onDelete={openDialog('delete')}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={paging.page}
            size={paging.size}
            total={paging.total}
            onPageChange={paging.onPageChange}
            onSizeChange={paging.onSizeChange}
          />
        </div>
      </ListState>
      {target?.kind === 'create' && (
        <TokenFormDialog
          key={target.session}
          open={open}
          onOpenChange={setOpen}
          onCreated={({ name, secret }) =>
            setReveal({ secret, message: `Token "${name}" created.` })
          }
        />
      )}
      {target?.kind === 'revoke' && target.token && (
        <RevokeTokenDialog
          key={target.session}
          token={target.token}
          open={open}
          onOpenChange={setOpen}
          onRevoked={({ name, secret }) =>
            setReveal({
              secret,
              message: `Token "${name}" revoked. Its new secret was shown once.`,
            })
          }
        />
      )}
      {target?.kind === 'delete' && target.token && (
        <DeleteTokenDialog
          key={target.session}
          token={target.token}
          open={open}
          onOpenChange={setOpen}
          onDeleted={announce}
        />
      )}
      <SecretReveal secret={reveal?.secret ?? null} onDone={done} finalFocus={returnFocusRef} />
      <LiveRegion message={message} />
    </section>
  );
};
AccessTokensPage.displayName = 'AccessTokensPage';

export default AccessTokensPage;
