import { useRef, useState } from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SendIcon,
  Trash2Icon,
  UndoIcon,
  XIcon,
} from 'lucide-react';

import { GatedButton } from '@/components/form/GatedButton';
import { Button } from '@/components/ui/button';
import {
  bulkDeleteSummary,
  bulkProgressText,
  bulkStatusSummary,
  type BulkSummary,
  type BulkTarget,
} from '@/features/content/bulk';
import { useBulkStatus } from '@/features/content/hooks/useBulkStatus';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import type { ContentTypeRef, DocumentStatus } from '@/features/content/types';
import { cn } from '@/utils/cn';

import { actionErrorText } from '../actionError';
import { BulkDeleteDialog } from './BulkDeleteDialog';

/** A selected row, as the bulk actions need it. */
export interface BulkSelectedEntry {
  documentId: string;
  status: DocumentStatus;
  /** The row's name, as in its link and checkbox. */
  label: string;
}

export interface BulkActionBarProps {
  type: ContentTypeRef;
  /** The selected rows on this page, in table order. */
  selected: readonly BulkSelectedEntry[];
  /** Replaces the selection, for example with the rows a bulk delete could not remove. */
  onSelectionChange: (ids: Set<string>) => void;
  /** Announces a summary without failures through the page's live region. */
  onAnnounce: (message: string) => void;
  /**
   * Where focus goes after a bulk delete that removed every selected row, since the bar and its
   * buttons go away. With failures, focus returns to Delete selected.
   */
  focusAfterDelete?: () => HTMLElement | null;
}

/** A summary on screen; `alert` when something failed. */
interface Outcome extends BulkSummary {
  alert: boolean;
}

/**
 * The bulk actions of the collection list (SPEC "Bulk bar"). With rows selected it shows "n
 * selected", Clear selection, Publish selected and Unpublish selected (D5, only with draft and
 * publish) and Delete selected (D10, confirmed), each gated by its decision. Below it, the
 * progress of a run ("Publishing 2 of 5…") and then its summary: announced through `onAnnounce`
 * when clean, an alert listing each failed entry otherwise. The summary stays after the selection
 * empties. A bulk delete leaves only the failed rows selected.
 */
export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  type,
  selected,
  onSelectionChange,
  onAnnounce,
  focusAfterDelete,
}) => {
  const access = useContentTypeAccess(type);
  const bulkStatus = useBulkStatus(type);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [running, setRunning] = useState<BulkTarget | null>(null);
  const [summary, setSummary] = useState<Outcome | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  // Every selected row was deleted, so Delete selected is about to unmount.
  const cleared = useRef(false);
  const count = selected.length;
  const busy = running !== null;

  // Labels are read when an action starts, before the refetch drops deleted rows.
  const labels = (ids: readonly string[]) => {
    const byId = new Map(selected.map((entry) => [entry.documentId, entry.label]));
    return new Map(ids.map((id) => [id, byId.get(id) ?? id]));
  };

  const runStatus = async (target: BulkTarget) => {
    const names = labels(selected.map((entry) => entry.documentId));
    setRunning(target);
    setSummary(null);
    try {
      const result = await bulkStatus.run(target, selected);
      const failed = result.failed.map(({ documentId, error }) => ({
        documentId,
        error: actionErrorText(error),
      }));
      show(bulkStatusSummary({ ...result, failed }, names));
    } catch (error) {
      setSummary({ message: actionErrorText(error), failures: [], alert: true });
    } finally {
      setRunning(null);
    }
  };

  // A summary with failures is an alert; a clean one is announced politely.
  const show = (next: BulkSummary) => {
    const alert = next.failures.length > 0;
    setSummary({ ...next, alert });
    if (!alert) onAnnounce(next.message);
  };

  const progress = bulkStatus.progress;
  if (count === 0 && !progress && !summary && !deleteOpen) return null;

  return (
    <div className="flex flex-col gap-2">
      {count > 0 && (
        <section
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2"
        >
          <p className="px-2 text-sm font-medium tabular-nums">{count} selected</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onSelectionChange(new Set())}
          >
            <XIcon aria-hidden="true" />
            Clear selection
          </Button>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {type.draftToPublish && (
              <>
                <GatedButton
                  variant="outline"
                  size="sm"
                  decision={access.publish}
                  disabled={busy && running !== 'publish'}
                  loading={running === 'publish'}
                  onClick={() => void runStatus('publish')}
                >
                  <SendIcon aria-hidden="true" />
                  Publish selected
                </GatedButton>
                <GatedButton
                  variant="outline"
                  size="sm"
                  decision={access.unpublish}
                  disabled={busy && running !== 'unpublish'}
                  loading={running === 'unpublish'}
                  onClick={() => void runStatus('unpublish')}
                >
                  <UndoIcon aria-hidden="true" />
                  Unpublish selected
                </GatedButton>
              </>
            )}
            <GatedButton
              variant="destructive"
              size="sm"
              decision={access.bulkDelete}
              disabled={busy}
              onClick={() => {
                setSummary(null);
                cleared.current = false;
                setDeleteIds(selected.map((entry) => entry.documentId));
                setDeleteOpen(true);
              }}
            >
              <Trash2Icon aria-hidden="true" />
              Delete selected
            </GatedButton>
          </div>
        </section>
      )}
      {progress && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Loader2Icon
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          {bulkProgressText(progress.target, progress.current, progress.total)}
        </p>
      )}
      {!progress && summary && (
        <div
          role={summary.alert ? 'alert' : undefined}
          className={cn(
            'flex flex-col gap-1 rounded-lg border p-3 text-sm',
            summary.alert && 'border-destructive/40',
          )}
        >
          <p className="flex items-center gap-2 font-medium">
            {summary.alert ? (
              <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            {summary.message}
          </p>
          {summary.failures.length > 0 && (
            <ul className="list-disc pl-10 text-destructive">
              {summary.failures.map((failure) => (
                <li key={failure.documentId} className="break-words">
                  {failure.label}: {failure.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <BulkDeleteDialog
        type={type}
        documentIds={deleteIds}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        finalFocus={() => (cleared.current ? (focusAfterDelete?.() ?? true) : true)}
        onDeleted={(result) => {
          cleared.current = result.failed.length === 0;
          show(bulkDeleteSummary(result, labels(deleteIds)));
          onSelectionChange(new Set(result.failed.map((failure) => failure.documentId)));
        }}
      />
    </div>
  );
};
BulkActionBar.displayName = 'BulkActionBar';
