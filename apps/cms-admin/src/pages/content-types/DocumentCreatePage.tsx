import { useCallback, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@repo/ui/components/button';
import { GatedButton } from '@repo/ui/form/GatedButton';
import { UnsavedChangesDialog } from '@repo/ui/form/UnsavedChangesDialog';

import { SchemaForm } from '@/components/form/SchemaForm';
import type { ForbiddenState } from '@/features/auth/components/RequireAccess';
import { useCreateDocument } from '@/features/content/hooks/useCollectionMutations';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import { useContentType } from '@/features/content/hooks/useContentTypes';
import { useUnsavedChangesGuard } from '@/features/content/hooks/useUnsavedChangesGuard';
import type { ContentType, DocumentData } from '@/features/content/types';

import { ContentTypeLoadState } from './ContentTypeLoadState';
import { EditorHeader } from './editor/EditorHeader';
import { documentPath, listPath, type AnnounceState } from './paths';

const FORM_ID = 'document-create-form';

const CreateForm: React.FC<{ type: ContentType }> = ({ type }) => {
  const access = useContentTypeAccess(type);
  const create = useCreateDocument(type);
  const navigate = useNavigate();
  const location = useLocation();
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChangesGuard(dirty);

  const submit = useCallback(
    async (data: DocumentData): Promise<DocumentData> => {
      const doc = await create.mutateAsync(data);
      guard.bypass();
      const state: AnnounceState = { announce: 'Entry created.' };
      void navigate(documentPath(type.slug, doc.documentId), { replace: true, state });
      return doc;
    },
    [create, guard, navigate, type.slug],
  );

  if (!access.create.allowed) {
    const state: ForbiddenState = { reason: access.create.reason, from: location.pathname };
    return <Navigate to="/403" replace state={state} />;
  }

  const actions = (
    <>
      <Button variant="outline" render={<Link to={listPath(type.slug)} />}>
        Cancel
      </Button>
      <GatedButton decision={access.create} type="submit" form={FORM_ID} loading={create.isPending}>
        Save
      </GatedButton>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <EditorHeader title="New entry" audit={null} actions={actions} />
      <SchemaForm
        id={FORM_ID}
        fields={type.fields}
        document={null}
        onSubmit={submit}
        onDirtyChange={setDirty}
      />
      <UnsavedChangesDialog guard={guard} />
    </div>
  );
};
CreateForm.displayName = 'CreateForm';

/**
 * `/admin/content-types/:slug/new`: the create page of a collection type. The form starts from
 * `emptyValues`. Save (gated by `create`) sends D2 and then replaces the URL with the new entry,
 * which announces "Entry created.". Cancel goes back to the list. Without `create` the page
 * redirects to `/403` with the reason; a single type has no create page and goes to its editor.
 */
const DocumentCreatePage: React.FC = () => {
  const { slug = '' } = useParams();
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
      <CreateForm type={type} />
    </section>
  );
};
DocumentCreatePage.displayName = 'DocumentCreatePage';

export default DocumentCreatePage;
