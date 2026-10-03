import { EllipsisVerticalIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCell, STATUS_LABELS } from '@/features/content/columns';
import type { DocumentStatus, UpdatedBy } from '@/features/content/types';
import { cn } from '@/utils/cn';

/** When and by whom a document was last saved. */
export interface EditorAudit {
  updatedAt: string;
  updatedBy: UpdatedBy;
}

export interface EditorHeaderProps {
  title: string;
  /** The status badge. Leave it out when the content type has no draft and publish. */
  status?: DocumentStatus;
  /** The audit line, or `null` for a document that was never saved ("Not saved yet"). */
  audit: EditorAudit | null;
  /** The page actions (Save, Publish, …), always shown as buttons. */
  actions?: React.ReactNode;
  /**
   * Secondary actions (Duplicate, Delete, …). From `sm` up they are buttons (`secondaryActions`);
   * below it the same actions are menu items (`moreActions`) in a "More actions" menu.
   */
  secondaryActions?: React.ReactNode;
  moreActions?: React.ReactNode;
  /**
   * Below `sm`, the actions sit in a bar fixed to the bottom of the viewport, so they stay
   * reachable; the page leaves room for it with `pb-24 sm:pb-0`.
   */
  stickyActions?: boolean;
}

const STICKY_BAR =
  'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-20 max-sm:flex-nowrap max-sm:justify-end max-sm:border-t max-sm:bg-background max-sm:px-4 max-sm:pt-2 max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))]';

const MoreActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="sm:hidden">
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" aria-label="More actions" />}
      >
        <EllipsisVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
MoreActions.displayName = 'MoreActions';

const BADGE_VARIANT = {
  draft: 'secondary',
  modified: 'outline',
  published: 'default',
} as const satisfies Record<DocumentStatus, 'secondary' | 'outline' | 'default'>;

/** A document status as a text badge (Draft, Modified or Published). */
export const StatusBadge: React.FC<{ status: DocumentStatus }> = ({ status }) => (
  <Badge variant={BADGE_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
);
StatusBadge.displayName = 'StatusBadge';

const AuditLine: React.FC<{ audit: EditorAudit }> = ({ audit }) => {
  const date = formatCell('date', audit.updatedAt, 'en');
  const name = audit.updatedBy?.name ? audit.updatedBy.name : 'an unknown user';
  return (
    <p className="text-sm text-muted-foreground">
      Updated{' '}
      <time dateTime={audit.updatedAt} title={date.title}>
        {date.text}
      </time>{' '}
      by {name}
    </p>
  );
};
AuditLine.displayName = 'AuditLine';

/** The editor's title row: the name, the status badge as text, the audit line and the actions. */
export const EditorHeader: React.FC<EditorHeaderProps> = ({
  title,
  status,
  audit,
  actions,
  secondaryActions,
  moreActions,
  stickyActions = false,
}) => (
  <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
        {status && <StatusBadge status={status} />}
      </div>
      {audit ? (
        <AuditLine audit={audit} />
      ) : (
        <p className="text-sm text-muted-foreground">Not saved yet</p>
      )}
    </div>
    {(actions || secondaryActions) && (
      <div
        role="group"
        aria-label="Entry actions"
        className={cn('flex shrink-0 flex-wrap items-center gap-2', stickyActions && STICKY_BAR)}
      >
        {moreActions && <MoreActions>{moreActions}</MoreActions>}
        {secondaryActions && <div className="hidden sm:contents">{secondaryActions}</div>}
        {actions}
      </div>
    )}
  </header>
);
EditorHeader.displayName = 'EditorHeader';
