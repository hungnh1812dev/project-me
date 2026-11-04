import { useMemo, useReducer } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormAlert,
} from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import type { DocumentTree } from '@features/content/Content.api';
import type { FieldNode } from '@features/content/FieldTree.rules';

import type { ConflictDetails } from './Conflict.rules';
import { DiffViewerBlock } from './DiffViewerBlock';
import {
  INITIAL_MERGE_STATE,
  maskedPathsOf,
  mergeReducer,
  sideOf,
  visibleEntries,
} from './Merge.reducer';
import { changeLabel, entryTitle, sideContent } from './MergeDescribe.rules';
import { buildResolvedTree } from './MergeTree.rules';

export interface ConflictMergeModalProps {
  details: ConflictDetails;
  fields: readonly FieldNode[];
  /** Paths the form already knows are masked for this role. */
  formMasked: ReadonlySet<string>;
  isSaving: boolean;
  /** A failed resubmit (not a new conflict), shown inside the modal. */
  error: string | null;
  /** Resubmit `tree` against `currentVersion`. */
  onResolve: (tree: DocumentTree, currentVersion: number) => void;
  /** Keep the saved version: drop the user's edits and reload. */
  onUseSaved: () => void;
  onClose: () => void;
}

/**
 * Field-level diff of a 409. Each difference is a pair of cards the
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
  isSaving,
  error,
  onResolve,
  onUseSaved,
  onClose,
}: ConflictMergeModalProps) {
  const text = useScreenText('content');
  const copy = text.content.conflict;
  const [state, dispatch] = useReducer(mergeReducer, INITIAL_MERGE_STATE);
  const masked = useMemo(() => maskedPathsOf(details, formMasked), [details, formMasked]);
  const entries = useMemo(() => visibleEntries(details, masked), [details, masked]);
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
          <p className="m-0 text-sm text-muted-foreground">{copy.summary(entries.length)}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => dispatch({ type: 'choose-all', paths, side: 'client' })}
            >
              {copy.keepAllMine}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dispatch({ type: 'choose-all', paths, side: 'server' })}
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
              title={entryTitle(entry, fields, details, text)}
              changeLabel={changeLabel(entry, text)}
              emptyText={copy.noValue}
              server={{
                label: copy.saved,
                content: sideContent(entry, 'server', fields, masked, text),
              }}
              client={{
                label: copy.mine,
                content: sideContent(entry, 'submitted', fields, masked, text),
              }}
              choice={sideOf(state, entry.path)}
              onChoiceChange={(side) => dispatch({ type: 'choose', path: entry.path, side })}
            />
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" disabled={isSaving}>
              {copy.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="primary"
            loading={isSaving}
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
