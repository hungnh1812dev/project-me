import { Badge } from '@/components/ui/badge';
import { formatCell, STATUS_LABELS } from '@/features/content/columns';
import type { DocumentStatus, UpdatedBy } from '@/features/content/types';

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
  /** The page actions (Save, Publish, …). */
  actions?: React.ReactNode;
}

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
export const EditorHeader: React.FC<EditorHeaderProps> = ({ title, status, audit, actions }) => (
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
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);
EditorHeader.displayName = 'EditorHeader';
