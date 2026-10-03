import type { BulkDeleteResult, DocumentStatus } from './types';

/** A bulk status action (D5): D6 or D7, one entry at a time. */
export type BulkTarget = 'publish' | 'unpublish';

/** One entry a bulk action could not handle, named for the summary. */
export interface BulkFailureLine {
  documentId: string;
  /** The entry's label, or its `documentId` when it has none. */
  label: string;
  error: string;
}

/** What a finished bulk action shows: one sentence, then each failed entry with its error. */
export interface BulkSummary {
  message: string;
  failures: BulkFailureLine[];
}

/** How a bulk publish or unpublish run ended. `failed[].error` is already user-facing text. */
export interface BulkStatusOutcome {
  target: BulkTarget;
  succeeded: string[];
  failed: { documentId: string; error?: string }[];
  /** The entries that already had the target status, so no request was sent for them. */
  skipped: string[];
}

const entries = (n: number) => (n === 1 ? '1 entry' : `${n} entries`);

const DONE: Record<BulkTarget, string> = { publish: 'published', unpublish: 'unpublished' };
const DOING: Record<BulkTarget, string> = { publish: 'Publishing', unpublish: 'Unpublishing' };
/** The status an entry ends with; entries already there are skipped. */
const SKIP_STATUS: Record<BulkTarget, DocumentStatus> = {
  publish: 'published',
  unpublish: 'draft',
};

function failureLines(
  failed: readonly { documentId: string; error?: string }[],
  labels: ReadonlyMap<string, string>,
  fallback: string,
): BulkFailureLine[] {
  return failed.map(({ documentId, error }) => ({
    documentId,
    label: labels.get(documentId) ?? documentId,
    error: error?.trim() ? error : fallback,
  }));
}

/** "<done> of <total> entries <verb>." when some failed, else "<done> entries <verb>.". */
function countSentence(done: number, failed: number, verb: string): string {
  return failed === 0
    ? `${entries(done)} ${verb}.`
    : `${done} of ${entries(done + failed)} ${verb}.`;
}

/**
 * The summary of a D10 result (AC-30): "2 of 3 entries deleted." with each failed entry, named by
 * `labels` (falling back to its `documentId`) and its error.
 */
export function bulkDeleteSummary(
  result: BulkDeleteResult,
  labels: ReadonlyMap<string, string>,
): BulkSummary {
  return {
    message: countSentence(result.deleted.length, result.failed.length, 'deleted'),
    failures: failureLines(result.failed, labels, "Couldn't delete this entry."),
  };
}

/**
 * Splits a selection for a bulk publish or unpublish (AC-31), keeping its order: publish acts on
 * draft and modified entries and skips published ones; unpublish acts on modified and published
 * entries and skips drafts.
 */
export function planBulkStatus(
  items: readonly { documentId: string; status: DocumentStatus }[],
  target: BulkTarget,
): { act: string[]; skipped: string[] } {
  const act: string[] = [];
  const skipped: string[] = [];
  for (const { documentId, status } of items) {
    (status === SKIP_STATUS[target] ? skipped : act).push(documentId);
  }
  return { act, skipped };
}

/** The progress line while a run is going: "Publishing 2 of 5…". */
export function bulkProgressText(target: BulkTarget, current: number, total: number): string {
  return `${DOING[target]} ${current} of ${total}…`;
}

/**
 * The summary of a bulk publish or unpublish run (AC-31): the success count (against the entries
 * acted on when some failed), the skip count, and each failure.
 */
export function bulkStatusSummary(
  outcome: BulkStatusOutcome,
  labels: ReadonlyMap<string, string>,
): BulkSummary {
  const { target, succeeded, failed, skipped } = outcome;
  const verb = DONE[target];
  const attempted = succeeded.length + failed.length;
  const parts = [
    attempted === 0
      ? `No entries to ${target}.`
      : countSentence(succeeded.length, failed.length, verb),
  ];
  if (skipped.length > 0) parts.push(`${skipped.length} skipped: already ${verb}.`);
  return {
    message: parts.join(' '),
    failures: failureLines(failed, labels, `Couldn't ${target} this entry.`),
  };
}
