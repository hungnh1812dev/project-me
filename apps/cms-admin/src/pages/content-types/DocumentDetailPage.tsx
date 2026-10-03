import { useCallback, useEffect, useState } from 'react';
import { CopyIcon, Trash2Icon } from 'lucide-react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { DropdownMenuSeparator } from '@repo/ui/components/dropdown-menu';

import { GatedButton } from '@/components/form/GatedButton';
import { GatedMenuItem } from '@/components/form/GatedMenuItem';
import { SchemaForm } from '@/components/form/SchemaForm';
import { UnsavedChangesDialog } from '@/components/form/UnsavedChangesDialog';
import type { Decision } from '@/features/auth/permissions/policies';
import {
  useDuplicateDocument,
  usePublishDocument,
  useUnpublishDocument,
  useUpdateDocument,
} from '@/features/content/hooks/useCollectionMutations';
import { useDocument } from '@/features/content/hooks/useCollectionQueries';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import { useContentType } from '@/features/content/hooks/useContentTypes';
import { useUnsavedChangesGuard } from '@/features/content/hooks/useUnsavedChangesGuard';
import { entryLabel } from '@/features/content/schema';
import type { ContentType, Document, DocumentData } from '@/features/content/types';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';

import { actionErrorText } from './actionError';
import { BackLink, ContentTypeLoadState } from './ContentTypeLoadState';
import { EditorHeader } from './editor/EditorHeader';
import { DeleteDocumentDialog } from './list/DeleteDocumentDialog';
import { announcementOf, documentPath, listPath, type AnnounceState } from './paths';

const FORM_ID = 'document-detail-form';
const SAVE_FIRST: Decision = { allowed: false, reason: 'Save your changes first.' };
const ALERT = 'text-sm text-destructive';

interface EditorProps {
  type: ContentType;
  doc: Document;
}

const DetailEditor: React.FC<EditorProps> = ({ type, doc }) => {
  const access = useContentTypeAccess(type);
  const update = useUpdateDocument(type);
  const publish = usePublishDocument(type);
  const unpublish = useUnpublishDocument(type);
  const duplicate = useDuplicateDocument(type);
  const navigate = useNavigate();
  const location = useLocation();
  const { message, announce } = useAnnouncer();
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const guard = useUnsavedChangesGuard(dirty);
  const label = entryLabel(type.fields, doc);

  // "Entry created." or "Copy created.", sent by the page that opened this entry.
  const opening = announcementOf(location.state);
  useEffect(() => {
    if (opening) announce(opening);
  }, [opening, announce]);

  const submit = useCallback(
    async (data: DocumentData): Promise<DocumentData> => {
      setActionError(null);
      const saved = await update.mutateAsync({ documentId: doc.documentId, data });
      announce('Saved.');
      return saved;
    },
    [update, doc.documentId, announce],
  );

  const runStatusAction = (mutation: typeof publish, done: string) => {
    setActionError(null);
    mutation.mutate(doc.documentId, {
      onSuccess: () => announce(done),
      onError: (error) => setActionError(actionErrorText(error)),
    });
  };

  const runDuplicate = () => {
    setActionError(null);
    duplicate.mutate(doc.documentId, {
      onSuccess: (copy) => {
        const state: AnnounceState = { announce: 'Copy created.' };
        void navigate(documentPath(type.slug, copy.documentId), { state });
      },
      onError: (error) => setActionError(actionErrorText(error)),
    });
  };

  const onDeleted = () => {
    guard.bypass();
    const state: AnnounceState = { announce: 'Entry deleted.' };
    void navigate(listPath(type.slug), { replace: true, state });
  };

  const showStatus = type.draftToPublish;
  const canPublish = showStatus && doc.status !== 'published';
  const canUnpublish = showStatus && doc.status !== 'draft';
  const publishDecision = dirty ? SAVE_FIRST : access.publish;
  const unpublishDecision = dirty ? SAVE_FIRST : access.unpublish;
  const duplicateDecision = dirty ? SAVE_FIRST : access.create;

  const actions = (
    <>
      {canPublish && (
        <GatedButton
          variant="outline"
          decision={publishDecision}
          loading={publish.isPending}
          onClick={() => runStatusAction(publish, 'Published.')}
        >
          Publish
        </GatedButton>
      )}
      <GatedButton
        decision={access.update}
        type="submit"
        form={FORM_ID}
        disabled={access.update.allowed && !dirty}
        loading={update.isPending}
      >
        Save
      </GatedButton>
    </>
  );

  const secondaryActions = (
    <>
      <GatedButton
        variant="ghost"
        decision={access.delete}
        onClick={() => setDeleteOpen(true)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2Icon aria-hidden="true" />
        Delete
      </GatedButton>
      <GatedButton
        variant="outline"
        decision={duplicateDecision}
        loading={duplicate.isPending}
        onClick={runDuplicate}
      >
        <CopyIcon aria-hidden="true" />
        Duplicate
      </GatedButton>
      {canUnpublish && (
        <GatedButton
          variant="outline"
          decision={unpublishDecision}
          loading={unpublish.isPending}
          onClick={() => runStatusAction(unpublish, 'Unpublished.')}
        >
          Unpublish
        </GatedButton>
      )}
    </>
  );

  const moreActions = (
    <>
      {canUnpublish && (
        <GatedMenuItem
          decision={unpublishDecision}
          onClick={() => runStatusAction(unpublish, 'Unpublished.')}
        >
          Unpublish
        </GatedMenuItem>
      )}
      <GatedMenuItem decision={duplicateDecision} onClick={runDuplicate}>
        <CopyIcon aria-hidden="true" />
        Duplicate
      </GatedMenuItem>
      <DropdownMenuSeparator />
      <GatedMenuItem
        decision={access.delete}
        variant="destructive"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2Icon aria-hidden="true" />
        Delete
      </GatedMenuItem>
    </>
  );

  return (
    <div className="flex flex-col gap-6 pb-24 sm:pb-0">
      <EditorHeader
        title={label}
        status={showStatus ? doc.status : undefined}
        audit={{ updatedAt: doc.updatedAt, updatedBy: doc.updatedBy }}
        actions={actions}
        secondaryActions={secondaryActions}
        moreActions={moreActions}
        stickyActions
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
      <DeleteDocumentDialog
        type={type}
        documentId={doc.documentId}
        label={label}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onDeleted}
      />
      <UnsavedChangesDialog guard={guard} />
      <LiveRegion message={message} />
    </div>
  );
};
DetailEditor.displayName = 'DetailEditor';

const EntryState: React.FC<{ type: ContentType; children: React.ReactNode }> = ({
  type,
  children,
}) => (
  <div className="flex flex-col items-start gap-3">
    {children}
    <BackLink to={listPath(type.slug)}>Back to {type.name}</BackLink>
  </div>
);
EntryState.displayName = 'EntryState';

const DetailBody: React.FC<{ type: ContentType; documentId: string }> = ({ type, documentId }) => {
  const access = useContentTypeAccess(type);
  const { data: doc, error, isPending } = useDocument(type, documentId);

  if (!access.read.allowed || error?.status === 403)
    return (
      <EntryState type={type}>
        <p role="alert" className={ALERT}>
          You don&apos;t have access to this entry.
        </p>
      </EntryState>
    );
  if (error?.status === 404)
    return (
      <EntryState type={type}>
        <p role="alert" className={ALERT}>
          This entry doesn&apos;t exist or was deleted.
        </p>
      </EntryState>
    );
  if (error)
    return (
      <EntryState type={type}>
        <p role="alert" className={ALERT}>
          Couldn&apos;t load this entry.
        </p>
      </EntryState>
    );
  if (isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading entry…
      </p>
    );
  // A new entry (a copy, the next document) starts a fresh form and guard.
  return <DetailEditor key={doc.documentId} type={type} doc={doc} />;
};
DetailBody.displayName = 'DetailBody';

/**
 * `/admin/content-types/:slug/:documentId`: the detail page of a collection entry (D3 to D8).
 * The form starts from the entry. Save (D4, `update`), Publish and Unpublish (D6, D7, after a
 * save), Duplicate (D8, `create`, opens the copy) and Delete (D5, `delete`, confirmed, back to
 * the list) are gated. Below `sm` the actions sit in a bottom bar with a "More actions" menu.
 * A 404 and a 403 each have their own state; a single type goes to its editor.
 */
const DocumentDetailPage: React.FC = () => {
  const { slug = '', documentId = '' } = useParams();
  const { data: type, error, isPending } = useContentType(slug);

  if (error || isPending)
    return (
      <section>
        <ContentTypeLoadState error={error} />
      </section>
    );
  if (type.kind === 'single') return <Navigate to={listPath(slug)} replace />;
  return (
    <section>
      <DetailBody type={type} documentId={documentId} />
    </section>
  );
};
DocumentDetailPage.displayName = 'DocumentDetailPage';

export default DocumentDetailPage;
