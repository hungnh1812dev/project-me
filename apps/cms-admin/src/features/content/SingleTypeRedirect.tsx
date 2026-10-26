import { FormAlert } from '@abyss/form-commons';
import { Navigate } from 'react-router';

import {
  LoadError,
  PageHeader,
  TableSkeleton,
} from '../../components/PageStates';
import { COPY } from '../../config/copy.constants';
import { contentEditPath, contentNewPath } from '../../config/routes';
import { isForbidden } from '../access';
import { useDocumentListQuery } from './content-queries';

const list = COPY.content.collection;

/**
 * `/content/:slug` of a single type: sends the caller to the one document's
 * edit form, or to the create form when none exists yet.
 */
export function SingleTypeRedirect({
  slug,
  draftAndPublish,
}: {
  slug: string;
  draftAndPublish: boolean;
}) {
  const documents = useDocumentListQuery(
    slug,
    1,
    undefined,
    draftAndPublish,
    true,
  );

  if (documents.isSuccess) {
    const [only] = documents.data.data;
    return (
      <Navigate
        replace
        to={
          only === undefined
            ? contentNewPath(slug)
            : contentEditPath(slug, only.documentId)
        }
      />
    );
  }
  return (
    <div className="grid gap-6">
      <PageHeader title={list.title(slug)} description={null} />
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
