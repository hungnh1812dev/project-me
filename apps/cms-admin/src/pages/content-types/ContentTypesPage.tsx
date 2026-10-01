import { Link } from 'react-router-dom';

import { useContentTypes } from '@/features/content/hooks/useContentTypes';
import type { ContentTypeSummary } from '@/features/content/types';

interface GroupProps {
  title: string;
  types: ContentTypeSummary[];
}

const ContentTypeGroup: React.FC<GroupProps> = ({ title, types }) => {
  const headingId = `content-types-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {types.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <ul>
          {types.map((type) => (
            <li key={type.slug}>
              <Link to={`/admin/content-types/${encodeURIComponent(type.slug)}`}>{type.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
ContentTypeGroup.displayName = 'ContentTypeGroup';

/**
 * `/admin/content-types`: unstyled placeholder (gated by `content_type:read`) that lists every
 * content type, grouped into single and collection types. The styled screen arrives in Phase 5.
 */
const ContentTypesPage: React.FC = () => {
  const { data, isPending, isError } = useContentTypes();

  return (
    <section>
      <h1>Content types</h1>
      {isError ? (
        <p role="alert">Couldn't load content types.</p>
      ) : isPending ? (
        <p role="status">Loading content types…</p>
      ) : (
        <>
          <ContentTypeGroup
            title="Single types"
            types={data.filter((type) => type.kind === 'single')}
          />
          <ContentTypeGroup
            title="Collection types"
            types={data.filter((type) => type.kind === 'collection')}
          />
        </>
      )}
    </section>
  );
};
ContentTypesPage.displayName = 'ContentTypesPage';

export default ContentTypesPage;
