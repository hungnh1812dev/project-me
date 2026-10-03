import { Navigate, useParams } from 'react-router-dom';

import { useContentType } from '@/features/content/hooks/useContentTypes';

/**
 * `/admin/content-types/:slug/new`: the create page of a collection type. A single type has no
 * create page, so it redirects to its editor at `:slug`. Stub until the create form (Phase 5.7).
 */
const DocumentCreatePage: React.FC = () => {
  const { slug = '' } = useParams();
  const { data: type } = useContentType(slug);

  if (type?.kind === 'single') {
    return <Navigate to={`/admin/content-types/${encodeURIComponent(slug)}`} replace />;
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">New entry</h1>
    </section>
  );
};
DocumentCreatePage.displayName = 'DocumentCreatePage';

export default DocumentCreatePage;
