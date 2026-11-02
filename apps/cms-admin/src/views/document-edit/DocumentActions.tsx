import { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@abyss/form-commons';
import { COPY } from '@configs/Copy.constants';
import type { PermissionAction } from '@features/access';
import { useCallerAccess } from '@features/access/useCallerAccess';
import type { DocumentRecord } from '@features/content/Content.api';
import { PUBLISH_STATE } from '@features/content/Content.constants';
import { toSaveError } from '@features/content/Content.errors';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { useContentApi } from '@features/content/ContentApi.context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const copy = COPY.content.actions;

type ConfirmedAction = 'unpublish' | 'discard';

interface DocumentActionsProps {
  slug: string;
  /** The loaded draft; null while creating (Save only). */
  record: DocumentRecord | null;
  /** Save, Publish and the rest apply to draft-and-publish types only. */
  draftAndPublish: boolean;
  rootFieldNames: readonly string[];
  isFormDirty: boolean;
  isSaving: boolean;
  onNotice: (notice: string | null) => void;
  onFailure: (failure: unknown) => void;
}

/**
 * The action row under the form: Save, and for a saved draft-and-publish
 * document Publish, Unpublish and Discard (SPEC §16.4). Secondary actions on
 * the left, the primary one on the right. Unpublish and Discard confirm first.
 */
export function DocumentActions({
  slug,
  record,
  draftAndPublish,
  rootFieldNames,
  isFormDirty,
  isSaving,
  onNotice,
  onFailure,
}: DocumentActionsProps) {
  const api = useContentApi();
  const queryClient = useQueryClient();
  const access = useCallerAccess();
  const [confirming, setConfirming] = useState<ConfirmedAction | null>(null);
  const holds = (action: PermissionAction) => access.can(slug, action) || access.can('*', action);
  const state = record?.publishState;
  const hasLifecycle = record !== null && draftAndPublish && state !== undefined;

  const refetch = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: CONTENT_QUERY_KEYS.draft(slug, record?.documentId ?? ''),
      }),
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.list(slug) }),
    ]);
  };
  const lifecycle = useMutation({
    mutationFn: async (action: 'publish' | ConfirmedAction) => {
      const documentId = record?.documentId ?? '';
      const version = record?.version ?? 0;
      if (action === 'publish') await api.publishDocument(slug, documentId, version);
      else if (action === 'unpublish') await api.unpublishDocument(slug, documentId);
      else await api.discardDocument(slug, documentId, version);
      return action;
    },
    onMutate: () => onNotice(null),
    onSuccess: async (action) => {
      setConfirming(null);
      await refetch();
      onNotice(
        { publish: copy.published, unpublish: copy.unpublished, discard: copy.discarded }[action],
      );
    },
    onError: async (failure) => {
      setConfirming(null);
      onFailure(failure);
      // A refetch changes the version and would drop this notice with the form.
      if (!toSaveError(failure).conflict) await refetch();
    },
  });
  const busy = lifecycle.isPending || isSaving;
  const isDraftOrModified = state === PUBLISH_STATE.DRAFT || state === PUBLISH_STATE.MODIFIED;
  const isLive = state === PUBLISH_STATE.MODIFIED || state === PUBLISH_STATE.PUBLISHED;
  const canDiscard =
    holds('update') && access.canWriteEveryField(slug, rootFieldNames) && hasLifecycle;

  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap justify-end gap-2 border-0 p-0">
      <legend className="sr-only">{copy.group}</legend>
      {hasLifecycle && holds('unpublish') ? (
        <Button
          type="button"
          variant="warning"
          disabled={!isLive || busy}
          onClick={() => setConfirming('unpublish')}
        >
          {copy.unpublish}
        </Button>
      ) : null}
      {canDiscard ? (
        <Button
          type="button"
          variant="destructive"
          disabled={state !== PUBLISH_STATE.MODIFIED || busy}
          onClick={() => setConfirming('discard')}
        >
          {copy.discard}
        </Button>
      ) : null}
      <Button
        type="submit"
        variant={hasLifecycle && holds('publish') ? 'secondary' : 'primary'}
        loading={isSaving}
        disabled={(record !== null && !isFormDirty) || lifecycle.isPending}
      >
        {COPY.content.save}
      </Button>
      {hasLifecycle && holds('publish') ? (
        <Button
          type="button"
          variant="primary"
          loading={lifecycle.isPending && lifecycle.variables === 'publish'}
          disabled={!isDraftOrModified || isFormDirty || busy}
          title={isFormDirty ? copy.publishNeedsSave : undefined}
          onClick={() => lifecycle.mutate('publish')}
        >
          {copy.publish}
        </Button>
      ) : null}
      {confirming === null ? null : (
        <ConfirmDialog
          action={confirming}
          isFormDirty={isFormDirty}
          isRunning={lifecycle.isPending}
          onConfirm={() => lifecycle.mutate(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </fieldset>
  );
}

function ConfirmDialog({
  action,
  isFormDirty,
  isRunning,
  onConfirm,
  onCancel,
}: {
  action: ConfirmedAction;
  isFormDirty: boolean;
  isRunning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const text = action === 'discard' ? copy.discardDialog : copy.unpublishDialog;
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>
            {text.description}
            {action === 'discard' && isFormDirty ? ` ${copy.discardDialog.unsavedEdits}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} type="button" onClick={onCancel}>
            {text.cancel}
          </Button>
          <Button
            type="button"
            variant={action === 'discard' ? 'destructive' : 'warning'}
            loading={isRunning}
            onClick={onConfirm}
          >
            {text.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
