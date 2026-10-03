import { useCallback, useState } from 'react';

import { GatedButton } from '@/components/form/GatedButton';
import { SchemaForm } from '@/components/form/SchemaForm';
import { isApiError } from '@/core/api/apiError';
import type { Decision } from '@/features/auth/permissions/policies';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import {
  usePublishSingleType,
  useSaveSingleType,
  useSingleTypeDocument,
  useUnpublishSingleType,
} from '@/features/content/hooks/useSingleType';
import type { ContentType, Document, DocumentData } from '@/features/content/types';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';

import { EditorHeader } from './editor/EditorHeader';

const FORM_ID = 'single-type-form';
const FORBIDDEN = "You don't have access to this content type.";
const NO_ACCESS = "You don't have access to do this.";
const SAVE_FIRST: Decision = { allowed: false, reason: 'Save your changes first.' };

const ALERT = 'text-sm text-destructive';
const STATUS = 'text-sm text-muted-foreground';

const actionErrorText = (error: unknown): string =>
  isApiError(error) && error.status === 403
    ? NO_ACCESS
    : error instanceof Error
      ? error.message
      : NO_ACCESS;

interface EditorProps {
  type: ContentType;
  /** The saved document, or `null` when the single type was never saved. */
  doc: Document | null;
}

const Editor: React.FC<EditorProps> = ({ type, doc }) => {
  const access = useContentTypeAccess(type);
  const save = useSaveSingleType(type);
  const publish = usePublishSingleType(type);
  const unpublish = useUnpublishSingleType(type);
  const { message, announce } = useAnnouncer();
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const submit = useCallback(
    async (data: DocumentData): Promise<DocumentData> => {
      setActionError(null);
      const savedDoc = await save.mutateAsync(data);
      announce('Saved.');
      return savedDoc;
    },
    [save, announce],
  );

  const runStatusAction = (mutation: typeof publish, done: string) => {
    setActionError(null);
    mutation.mutate(undefined, {
      onSuccess: () => announce(done),
      onError: (error) => setActionError(actionErrorText(error)),
    });
  };

  const showStatus = type.draftToPublish && doc !== null;
  const actions = (
    <>
      <GatedButton
        decision={access.update}
        type="submit"
        form={FORM_ID}
        disabled={access.update.allowed && !dirty}
        loading={save.isPending}
      >
        Save
      </GatedButton>
      {showStatus && doc.status !== 'published' && (
        <GatedButton
          variant="outline"
          decision={dirty ? SAVE_FIRST : access.publish}
          loading={publish.isPending}
          onClick={() => runStatusAction(publish, 'Published.')}
        >
          Publish
        </GatedButton>
      )}
      {showStatus && doc.status !== 'draft' && (
        <GatedButton
          variant="outline"
          decision={dirty ? SAVE_FIRST : access.unpublish}
          loading={unpublish.isPending}
          onClick={() => runStatusAction(unpublish, 'Unpublished.')}
        >
          Unpublish
        </GatedButton>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <EditorHeader
        title={type.name}
        status={showStatus ? doc.status : undefined}
        audit={doc && { updatedAt: doc.updatedAt, updatedBy: doc.updatedBy }}
        actions={actions}
      />
      {actionError && (
        <p role="alert" className={ALERT}>
          {actionError}
        </p>
      )}
      <SchemaForm
        id={FORM_ID}
        fields={type.fields}
        document={doc}
        onSubmit={submit}
        readOnly={!access.update.allowed}
        readOnlyReason={access.update.reason ?? undefined}
        onDirtyChange={setDirty}
      />
      <LiveRegion message={message} />
    </div>
  );
};
Editor.displayName = 'Editor';

/**
 * The single-type editor (S1 to S4). S1 loads the document; a never-saved one shows "Not saved
 * yet" with empty values. Save (S2) is gated by `update`. Publish (S3) and Unpublish (S4) follow
 * the status, are gated by their own decisions and wait for a clean form, and are left out when
 * the content type has no draft and publish.
 */
const SingleTypeEditorPage: React.FC<{ type: ContentType }> = ({ type }) => {
  const access = useContentTypeAccess(type);
  const { data, error, isPending } = useSingleTypeDocument(type);

  let body: React.ReactNode;
  if (!access.read.allowed || error?.status === 403)
    body = (
      <p role="alert" className={ALERT}>
        {FORBIDDEN}
      </p>
    );
  else if (error)
    body = (
      <p role="alert" className={ALERT}>
        Couldn't load the document.
      </p>
    );
  else if (isPending)
    body = (
      <p role="status" className={STATUS}>
        Loading document…
      </p>
    );
  else return <Editor type={type} doc={data} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{type.name}</h1>
      {body}
    </div>
  );
};
SingleTypeEditorPage.displayName = 'SingleTypeEditorPage';

export default SingleTypeEditorPage;
