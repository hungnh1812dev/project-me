import { FormAlert } from '@abyss/form-commons';
import { LoadError, PageHeader, TableSkeleton } from '@components/PageStates';
import { contentEditPath, contentNewPath } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import { isForbidden } from '@features/access';
import { useDocumentListQuery } from '@features/content/Content.queries';
import { Navigate } from 'react-router';

const list = COPY.content.collection;

/**
 * `/content/:slug` of a single type: sends the caller to the one document's
 * edit form, or to the create form when none exists yet.
 */
export function SingleTypeRedirect({
  slug,
  displayName,
  draftAndPublish,
}: {
  slug: string;
  displayName: string;
  draftAndPublish: boolean;
}) {
  const documents = useDocumentListQuery(slug, 1, undefined, draftAndPublish, true);

  if (documents.isSuccess) {
    const [only] = documents.data.data;
    return (
      <Navigate
        replace
        to={only === undefined ? contentNewPath(slug) : contentEditPath(slug, only.documentId)}
      />
    );
  }
  return (
    <div className="grid gap-6">
      <PageHeader title={list.title(displayName)} description={null} />
      {documents.isError ? (
        isForbidden(documents.error) ? (
          <FormAlert tone="info">{list.forbidden}</FormAlert>
        ) : (
          <LoadError
            message={list.loadFailed}
            isRetrying={documents.isFetching}
            onRetry={() => void documents.refetch()}
          />
        )
      ) : (
        <TableSkeleton label={list.loading} />
      )}
    </div>
  );
}
