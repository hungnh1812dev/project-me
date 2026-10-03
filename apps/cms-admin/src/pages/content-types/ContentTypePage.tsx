import { useParams } from 'react-router-dom';

import { useContentType } from '@/features/content/hooks/useContentTypes';

import CollectionListPage from './CollectionListPage';
import { ContentTypeLoadState } from './ContentTypeLoadState';
import SingleTypeEditorPage from './SingleTypeEditorPage';

/**
 * `/admin/content-types/:slug` (gated by `content_type:read`): loads the content type, then shows
 * the single-type editor or, for a collection type, the collection list.
 */
const ContentTypePage: React.FC = () => {
  const { slug = '' } = useParams();
  const { data: type, error, isPending } = useContentType(slug);

  if (error || isPending)
    return (
      <section>
        <ContentTypeLoadState error={error} />
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
