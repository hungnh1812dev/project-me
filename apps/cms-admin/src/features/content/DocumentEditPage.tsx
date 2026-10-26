import { Button, FormAlert } from '@abyss/form-commons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';

import { COPY } from '../../config/Copy.constants';
import { REVIEWER_ROLE_SLUG } from '../../config/Auth.constants';
import { contentEditPath } from '../../config/App.routes';
import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { useCurrentUser } from '../auth';
import { useContentApi } from './content-api-context';
import { CONTENT_QUERY_KEYS } from './content-queries';
import { ConflictMergeModal } from './ConflictMergeModal';
import { type ConflictDetails, conflictDetailsOf } from './conflict';
import { isMissing, toSaveError, type SaveError } from './content-error';
import type { DocumentRecord, DocumentTree } from './content.api';
import { type FormValues, toDocumentTree, toFormValues } from './document-form';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import { buildFieldTree, type FieldNode } from './field-tree';
import { PresenceBanner } from './PresenceBanner';
import { maskedPathsOf, visibleEntries } from './merge.reducer';

const copy = COPY.content;

/**
 * `/content/:slug/new` and `/content/:slug/:documentId`: the dynamic
 * form of one document's draft. Creating goes to the edit route; saving an
 * existing draft sends its version (a stale one is a 409 that opens the merge modal).
 */
export function DocumentEditPage() {
  const { slug = '', documentId } = useParams();
  const api = useContentApi();
  // Held here: the form remounts when a save brings a new version.
  const [notice, setNotice] = useState<string | null>(null);
  const type = useQuery({
    queryKey: CONTENT_QUERY_KEYS.type(slug),
    queryFn: () => api.getContentType(slug),
  });
  const draftAndPublish = type.data?.draftAndPublish ?? false;
  const draft = useQuery({
    queryKey: CONTENT_QUERY_KEYS.draft(slug, documentId ?? ''),
    queryFn: () => api.getDraft(slug, documentId ?? '', draftAndPublish),
    enabled: documentId !== undefined && type.isSuccess,
  });
  const fields = useMemo(
    () => (type.data === undefined ? [] : buildFieldTree(type.data.fields)),
    [type.data],
  );
  const title =
    documentId === undefined ? copy.newTitle(slug) : copy.editTitle(slug);

  if (
    type.isPending ||
    (documentId !== undefined && draft.isPending && !draft.isError)
  ) {
    return (
      <div className="grid gap-6">
        <PageHeader title={title} description={copy.description} />
        <TableSkeleton label={copy.loading} />
      </div>
    );
  }
  const failed = type.isError ? type : draft.isError ? draft : null;
  if (failed !== null) {
    return (
      <div className="grid gap-6">
        <PageHeader title={title} description={copy.description} />
        {isMissing(failed.error) ? (
          <FormAlert tone="info">
            {failed === type ? copy.typeNotFound : copy.documentNotFound}
          </FormAlert>
        ) : (
          <LoadError
            message={copy.loadFailed}
            isRetrying={failed.isFetching}
            onRetry={() => void failed.refetch()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={title} description={copy.description} />
      {documentId === undefined ? null : (
        <PresenceBanner slug={slug} documentId={documentId} />
      )}
      {fields.length === 0 ? (
        <FormAlert tone="info">{copy.noFields}</FormAlert>
      ) : (
        <DocumentForm
          // A saved or reloaded draft has a new version: start from its data.
          key={`${documentId ?? 'new'}:${draft.data?.version ?? 0}`}
          slug={slug}
          fields={fields}
          record={draft.data ?? null}
          onReload={() => void draft.refetch()}
          notice={notice}
          onNotice={setNotice}
        />
      )}
    </div>
  );
}

function DocumentForm({
  slug,
  fields,
  record,
  onReload,
  notice,
  onNotice,
}: {
  slug: string;
  fields: FieldNode[];
  record: DocumentRecord | null;
  onReload: () => void;
  notice: string | null;
  onNotice: (notice: string | null) => void;
}) {
  const api = useContentApi();
  const readOnly = useCurrentUser()?.role === REVIEWER_ROLE_SLUG;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const masked = useMemo<ReadonlySet<string>>(
    () => new Set(record?.maskedFields ?? []),
    [record],
  );
  const initial = useMemo(() => toFormValues(fields, record), [fields, record]);
  const form = useForm<FormValues>({ defaultValues: initial });
  const [error, setError] = useState<SaveError | null>(null);
  const [conflict, setConflict] = useState<ConflictDetails | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      if (record === null) {
        return api.createDocument(
          slug,
          toDocumentTree(fields, values, null, masked),
        );
      }
      return api.updateDocument(
        slug,
        record.documentId,
        record.version,
        toDocumentTree(fields, values, initial, masked),
      );
    },
    onSuccess: async (written) => {
      setError(null);
      if (record === null) {
        void navigate(contentEditPath(slug, written.documentId), {
          replace: true,
        });
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: CONTENT_QUERY_KEYS.draft(slug, record.documentId),
      });
      onNotice(copy.saved);
    },
    onError: (failure) => {
      onNotice(null);
      setError(toSaveError(failure));
      const details = conflictDetailsOf(failure);
      // Only worth a merge when there is a difference the role may see.
      const decidable =
        details !== null &&
        visibleEntries(details, maskedPathsOf(details, masked)).length > 0;
      setConflict(decidable ? details : null);
      setMergeOpen(decidable);
      setMergeError(null);
    },
  });

  const resolve = useMutation({
    mutationFn: (input: { tree: DocumentTree; version: number }) =>
      api.updateDocument(
        slug,
        record?.documentId ?? '',
        input.version,
        input.tree,
      ),
    onSuccess: async () => {
      setError(null);
      setConflict(null);
      setMergeOpen(false);
      await queryClient.invalidateQueries({
        queryKey: CONTENT_QUERY_KEYS.draft(slug, record?.documentId ?? ''),
      });
      onNotice(copy.saved);
    },
    onError: (failure) => {
      const details = conflictDetailsOf(failure);
      if (details !== null) {
        // Someone saved again while merging: diff against that version.
        setConflict(details);
        setMergeError(null);
        return;
      }
      setMergeError(toSaveError(failure).message);
    },
  });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="grid gap-6"
        onSubmit={(event) => {
          onNotice(null);
          void form.handleSubmit((values) => save.mutate(values))(event);
        }}
      >
        {error === null ? null : (
          <div className="grid justify-items-start gap-3">
            <FormAlert tone={error.tone}>{error.message}</FormAlert>
            {error.conflict ? (
              <div className="flex flex-wrap gap-2">
                {conflict === null ? null : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setMergeOpen(true)}
                  >
                    {copy.errors.reviewConflict}
                  </Button>
                )}
                <Button type="button" onClick={onReload}>
                  {copy.errors.reload}
                </Button>
              </div>
            ) : null}
          </div>
        )}
        {notice === null ? null : (
          <FormAlert tone="success">{notice}</FormAlert>
        )}
        {/* A reviewer reads only: inputs are disabled and there is no Save. */}
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
          <DynamicFormRenderer fields={fields} masked={masked} />
        </fieldset>
        {readOnly ? null : (
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={save.isPending}>
              {copy.save}
            </Button>
          </div>
        )}
      </form>
      {conflict !== null && mergeOpen ? (
        <ConflictMergeModal
          details={conflict}
          fields={fields}
          formMasked={masked}
          isSaving={resolve.isPending}
          error={mergeError}
          onResolve={(tree, version) => resolve.mutate({ tree, version })}
          onUseSaved={() => {
            setMergeOpen(false);
            setConflict(null);
            setError(null);
            onReload();
          }}
          onClose={() => setMergeOpen(false)}
        />
      ) : null}
    </FormProvider>
  );
}
