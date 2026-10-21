import { Button } from '@abyss/form-commons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';

import { COPY } from '../../config/copy.constants';
import { contentEditPath } from '../../config/routes';
import { LoadError, PageHeader, TableSkeleton } from '../access/PageStates';
import { FormAlert } from '../auth/FormAlert';
import { useContentApi } from './content-api-context';
import { isMissing, toSaveError, type SaveError } from './content-error';
import type { DocumentRecord } from './content.api';
import { type FormValues, toDocumentTree, toFormValues } from './document-form';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import { buildFieldTree, type FieldNode } from './field-tree';

const copy = COPY.content;

const QUERY_KEYS = {
  type: (slug: string) => ['content', 'type', slug],
  draft: (slug: string, documentId: string) => [
    'content',
    'draft',
    slug,
    documentId,
  ],
} as const;

/**
 * `/content/:slug/new` and `/content/:slug/:documentId` (T23): the dynamic
 * form of one document's draft. Creating goes to the edit route; saving an
 * existing draft sends its version (a stale one is a 409, see T25 for merge).
 */
export function DocumentEditPage() {
  const { slug = '', documentId } = useParams();
  const api = useContentApi();
  // Held here: the form remounts when a save brings a new version.
  const [notice, setNotice] = useState<string | null>(null);
  const type = useQuery({
    queryKey: QUERY_KEYS.type(slug),
    queryFn: () => api.getContentType(slug),
  });
  const draftAndPublish = type.data?.draftAndPublish ?? false;
  const draft = useQuery({
    queryKey: QUERY_KEYS.draft(slug, documentId ?? ''),
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
            retrying={failed.isFetching}
            onRetry={() => void failed.refetch()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={title} description={copy.description} />
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const masked = useMemo<ReadonlySet<string>>(
    () => new Set(record?.maskedFields ?? []),
    [record],
  );
  const initial = useMemo(() => toFormValues(fields, record), [fields, record]);
  const form = useForm<FormValues>({ defaultValues: initial });
  const [error, setError] = useState<SaveError | null>(null);

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
        queryKey: QUERY_KEYS.draft(slug, record.documentId),
      });
      onNotice(copy.saved);
    },
    onError: (failure) => {
      onNotice(null);
      setError(toSaveError(failure));
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
              <Button type="button" onClick={onReload}>
                {copy.errors.reload}
              </Button>
            ) : null}
          </div>
        )}
        {notice === null ? null : (
          <FormAlert tone="success">{notice}</FormAlert>
        )}
        <DynamicFormRenderer fields={fields} masked={masked} />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={save.isPending}>
            {copy.save}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
