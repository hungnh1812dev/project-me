import { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import type { PermissionAction } from '@features/access';
import { useCallerAccess } from '@features/access/useCallerAccess';
import type { DocumentRecord } from '@features/content/Content.api';
import { PUBLISH_STATE } from '@features/content/Content.constants';
import { toSaveError } from '@features/content/Content.errors';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { useContentApi } from '@features/content/ContentApi.context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const LIFECYCLE_TOAST_KEY = 'document-lifecycle';

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
  onFailure: (failure: unknown) => void;
}

/**
 * The action row under the form: Save, and for a saved draft-and-publish
 * document Publish, Unpublish and Discard (SPEC §16.4). The destructive Discard
 * sits apart at the left end, secondary actions then the one primary on the
 * right (ADM-6). Unpublish and Discard confirm first.
 */
export function DocumentActions({
  slug,
  record,
  draftAndPublish,
  rootFieldNames,
  isFormDirty,
  isSaving,
  onFailure,
}: DocumentActionsProps) {
  const content = useScreenText('content');
  const copy = content.content.actions;
  const api = useContentApi();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const access = useCallerAccess();
  const [confirming, setConfirming] = useState<ConfirmedAction | null>(null);
  // The dialog stays mounted with its last action so Radix can run its close
  // focus handling; it only restores focus to a DialogTrigger, which these
  // buttons are not, so the opening button is remembered here.
  const [lastConfirmed, setLastConfirmed] = useState<ConfirmedAction>('unpublish');
  const opener = useRef<HTMLElement | null>(null);
  const askToConfirm = (action: ConfirmedAction, trigger: HTMLElement) => {
    opener.current = trigger;
    setLastConfirmed(action);
    setConfirming(action);
  };
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
    onSuccess: async (action) => {
      setConfirming(null);
      await refetch();
      showToast({
        tone: 'success',
        title: {
          publish: copy.published,
          unpublish: copy.unpublished,
          discard: copy.discarded,
        }[action],
        key: LIFECYCLE_TOAST_KEY,
      });
    },
    onError: async (failure) => {
      setConfirming(null);
      onFailure(failure);
      // A refetch changes the version and remounts the form, which would drop the error shown with it.
      if (!toSaveError(failure, content).conflict) await refetch();
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
      {canDiscard ? (
        <Button
          type="button"
          variant="destructive"
          className="mr-auto"
          disabled={state !== PUBLISH_STATE.MODIFIED || busy}
          onClick={(event) => askToConfirm('discard', event.currentTarget)}
        >
          {copy.discard}
        </Button>
      ) : null}
      {hasLifecycle && holds('unpublish') ? (
        <Button
          type="button"
          variant="warning"
          disabled={!isLive || busy}
          onClick={(event) => askToConfirm('unpublish', event.currentTarget)}
        >
          {copy.unpublish}
        </Button>
      ) : null}
      <Button
        type="submit"
        variant={hasLifecycle && holds('publish') ? 'secondary' : 'primary'}
        loading={isSaving}
        disabled={(record !== null && !isFormDirty) || lifecycle.isPending}
      >
        {content.content.save}
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
      <ConfirmDialog
        open={confirming !== null}
        action={lastConfirmed}
        onCloseFocus={() => opener.current?.focus()}
        isFormDirty={isFormDirty}
        isRunning={lifecycle.isPending}
        onConfirm={() => lifecycle.mutate(lastConfirmed)}
        onCancel={() => setConfirming(null)}
      />
    </fieldset>
  );
}

function ConfirmDialog({
  open,
  action,
  onCloseFocus,
  isFormDirty,
  isRunning,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  action: ConfirmedAction;
  isFormDirty: boolean;
  isRunning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onCloseFocus: () => void;
}) {
  const copy = useScreenText('content').content.actions;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const text = action === 'discard' ? copy.discardDialog : copy.unpublishDialog;
  return (
    <Dialog open={open} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus();
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
