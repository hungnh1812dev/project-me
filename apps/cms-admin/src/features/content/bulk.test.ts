import { describe, expect, it } from 'vitest';

import {
  bulkDeleteSummary,
  bulkProgressText,
  bulkStatusSummary,
  planBulkStatus,
  type BulkStatusOutcome,
  type BulkTarget,
} from './bulk';
import type { DocumentStatus } from './types';

const LABELS = new Map([
  ['a', 'Alpha'],
  ['b', 'Beta'],
  ['c', 'Gamma'],
]);

describe('bulkDeleteSummary (AC-30)', () => {
  it('says how many of the selection were deleted and lists each failure with its error', () => {
    const summary = bulkDeleteSummary(
      { deleted: ['a', 'c'], failed: [{ documentId: 'b', error: 'Entry is locked.' }] },
      LABELS,
    );

    expect(summary).toEqual({
      message: '2 of 3 entries deleted.',
      failures: [{ documentId: 'b', label: 'Beta', error: 'Entry is locked.' }],
    });
  });

  it.each([
    [['a', 'b', 'c'], '3 entries deleted.'],
    [['a'], '1 entry deleted.'],
  ])('says "%s" when every entry was deleted', (deleted, message) => {
    expect(bulkDeleteSummary({ deleted, failed: [] }, LABELS)).toEqual({ message, failures: [] });
  });

  it('counts a single entry that failed, and falls back to a generic error and the documentId', () => {
    const summary = bulkDeleteSummary({ deleted: [], failed: [{ documentId: 'zzz' }] }, LABELS);

    expect(summary).toEqual({
      message: '0 of 1 entry deleted.',
      failures: [{ documentId: 'zzz', label: 'zzz', error: "Couldn't delete this entry." }],
    });
  });

  it('treats a blank error as missing', () => {
    const summary = bulkDeleteSummary(
      { deleted: ['a'], failed: [{ documentId: 'b', error: '  ' }] },
      LABELS,
    );

    expect(summary.failures[0]!.error).toBe("Couldn't delete this entry.");
  });
});

describe('planBulkStatus (AC-31)', () => {
  const items: { documentId: string; status: DocumentStatus }[] = [
    { documentId: 'd', status: 'draft' },
    { documentId: 'm', status: 'modified' },
    { documentId: 'p', status: 'published' },
  ];

  it.each<[BulkTarget, string[], string[]]>([
    ['publish', ['d', 'm'], ['p']],
    ['unpublish', ['m', 'p'], ['d']],
  ])('%s acts on %j and skips %j, keeping the order', (target, act, skipped) => {
    expect(planBulkStatus(items, target)).toEqual({ act, skipped });
  });

  it('gives empty lists for an empty selection', () => {
    expect(planBulkStatus([], 'publish')).toEqual({ act: [], skipped: [] });
  });
});

describe('bulkProgressText (AC-31)', () => {
  it.each<[BulkTarget, number, number, string]>([
    ['publish', 2, 5, 'Publishing 2 of 5…'],
    ['unpublish', 1, 1, 'Unpublishing 1 of 1…'],
  ])('%s at %i of %i reads "%s"', (target, current, total, text) => {
    expect(bulkProgressText(target, current, total)).toBe(text);
  });
});

describe('bulkStatusSummary (AC-31)', () => {
  const outcome = (over: Partial<BulkStatusOutcome>): BulkStatusOutcome => ({
    target: 'publish',
    succeeded: [],
    failed: [],
    skipped: [],
    ...over,
  });

  it('says every acted entry succeeded', () => {
    expect(bulkStatusSummary(outcome({ succeeded: ['a', 'b'] }), LABELS)).toEqual({
      message: '2 entries published.',
      failures: [],
    });
  });

  it('counts the failures against the entries it acted on, and names each failure', () => {
    const summary = bulkStatusSummary(
      outcome({
        succeeded: ['a', 'c'],
        failed: [{ documentId: 'b', error: "You don't have access to do this." }],
      }),
      LABELS,
    );

    expect(summary).toEqual({
      message: '2 of 3 entries published.',
      failures: [{ documentId: 'b', label: 'Beta', error: "You don't have access to do this." }],
    });
  });

  it.each<[BulkTarget, string[], string]>([
    ['publish', ['c'], '1 entry published. 1 skipped: already published.'],
    ['unpublish', ['c', 'b'], '1 entry unpublished. 2 skipped: already unpublished.'],
  ])('%s adds the skip count', (target, skipped, message) => {
    expect(bulkStatusSummary(outcome({ target, succeeded: ['a'], skipped }), LABELS).message).toBe(
      message,
    );
  });

  it.each<[BulkTarget, string]>([
    ['publish', 'No entries to publish. 2 skipped: already published.'],
    ['unpublish', 'No entries to unpublish. 2 skipped: already unpublished.'],
  ])('%s says there was nothing to do when every entry was skipped', (target, message) => {
    expect(bulkStatusSummary(outcome({ target, skipped: ['a', 'b'] }), LABELS).message).toBe(
      message,
    );
  });

  it('falls back to a generic error for a blank one', () => {
    const summary = bulkStatusSummary(
      outcome({ target: 'unpublish', failed: [{ documentId: 'x', error: '' }] }),
      LABELS,
    );

    expect(summary).toEqual({
      message: '0 of 1 entry unpublished.',
      failures: [{ documentId: 'x', label: 'x', error: "Couldn't unpublish this entry." }],
    });
  });
});
