import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiffViewerBlock,
  FormAlert,
} from '@abyss/form-commons';
import { useMemo, useReducer } from 'react';

import { COPY } from '../../config/copy.constants';
import type { ConflictDetails } from './conflict';
import type { DocumentTree } from './content.api';
import type { FieldNode } from './field-tree';
import { changeLabel, entryTitle, sideContent } from './merge.describe';
import {
  INITIAL_MERGE_STATE,
  maskedPathsOf,
  mergeReducer,
  sideOf,
  visibleEntries,
} from './merge.reducer';
import { buildResolvedTree } from './merge.tree';

const copy = COPY.content.conflict;

export interface ConflictMergeModalProps {
  details: ConflictDetails;
  fields: readonly FieldNode[];
  /** Paths the form already knows are masked for this role. */
  formMasked: ReadonlySet<string>;
  saving: boolean;
  /** A failed resubmit (not a new conflict), shown inside the modal. */
  error: string | null;
  /** Resubmit `tree` against `currentVersion`. */
  onResolve: (tree: DocumentTree, currentVersion: number) => void;
  /** Keep the saved version: drop the user's edits and reload. */
  onUseSaved: () => void;
  onClose: () => void;
}

/**
 * Field-level diff of a 409 (T25). Each difference is a pair of cards the
 * user picks from (default: keep their own edit); the result is sent with
 * the version the server reported. Masked fields are filtered out first.
 */
export function ConflictMergeModal(props: ConflictMergeModalProps) {
  // New conflict (another save during the merge) starts the choices over.
  return <MergeDialog key={props.details.currentVersion} {...props} />;
}

function MergeDialog({
  details,
  fields,
  formMasked,
  saving,
  error,
  onResolve,
  onUseSaved,
  onClose,
}: ConflictMergeModalProps) {
  const [state, dispatch] = useReducer(mergeReducer, INITIAL_MERGE_STATE);
  const masked = useMemo(
    () => maskedPathsOf(details, formMasked),
    [details, formMasked],
  );
  const entries = useMemo(
    () => visibleEntries(details, masked),
    [details, masked],
  );
  const paths = entries.map((entry) => entry.path);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {error === null ? null : <FormAlert tone="error">{error}</FormAlert>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-sm text-muted-foreground">
            {copy.summary(entries.length)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                dispatch({ type: 'choose-all', paths, side: 'client' })
              }
            >
              {copy.keepAllMine}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                dispatch({ type: 'choose-all', paths, side: 'server' })
              }
            >
              {copy.takeAllSaved}
            </Button>
          </div>
        </div>
        <div className="grid gap-3">
          {entries.map((entry) => (
            <DiffViewerBlock
              key={entry.path}
              name={`merge:${entry.path}`}
              title={entryTitle(entry, fields, details)}
              changeLabel={changeLabel(entry)}
              emptyText={copy.noValue}
              server={{
                label: copy.saved,
                content: sideContent(entry, 'server', fields, masked),
              }}
              client={{
                label: copy.mine,
                content: sideContent(entry, 'submitted', fields, masked),
              }}
              choice={sideOf(state, entry.path)}
              onChoiceChange={(side) =>
                dispatch({ type: 'choose', path: entry.path, side })
              }
            />
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" disabled={saving}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            onClick={() => {
              const tree = buildResolvedTree(details, entries, state, masked);
              if (tree.values === undefined && tree.components === undefined) {
                onUseSaved();
                return;
              }
              onResolve(tree, details.currentVersion);
            }}
          >
            {copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
