import { useParams } from 'react-router-dom';

import type { ApiError } from '@/core/api/apiError';
import { useContentType } from '@/features/content/hooks/useContentTypes';

import CollectionListPage from './CollectionListPage';
import SingleTypeEditorPage from './SingleTypeEditorPage';

const FORBIDDEN = "You don't have access to this content type.";

const ALERT = 'text-sm text-destructive';
const STATUS = 'text-sm text-muted-foreground';

const Forbidden: React.FC = () => (
  <p role="alert" className={ALERT}>
    {FORBIDDEN}
  </p>
);
Forbidden.displayName = 'Forbidden';

const isForbidden = (error: ApiError | null) => error?.status === 403;

/**
 * `/admin/content-types/:slug` (gated by `content_type:read`): loads the content type, then shows
 * the single-type editor or, for a collection type, the collection list.
 */
const ContentTypePage: React.FC = () => {
  const { slug = '' } = useParams();
  const { data: type, error, isPending } = useContentType(slug);

  if (isForbidden(error))
    return (
      <section>
        <Forbidden />
      </section>
    );
  if (error?.status === 404)
    return (
      <section>
        <p role="alert" className={ALERT}>
          Content type not found.
        </p>
      </section>
    );
  if (error)
    return (
      <section>
        <p role="alert" className={ALERT}>
          Couldn't load this content type.
        </p>
      </section>
    );
  if (isPending)
    return (
      <section>
        <p role="status" className={STATUS}>
          Loading content type…
        </p>
      </section>
    );

  if (type.kind === 'single')
    return (
      <section>
        <SingleTypeEditorPage type={type} />
      </section>
    );

  return (
    <section>
      <CollectionListPage type={type} />
    </section>
  );
};
ContentTypePage.displayName = 'ContentTypePage';

export default ContentTypePage;
