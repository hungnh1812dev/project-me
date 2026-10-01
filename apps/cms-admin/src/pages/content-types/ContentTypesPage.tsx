import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
      <Card className="h-full">
        <CardHeader className="grid-cols-[1fr_auto]">
          <h2 id={headingId} className="text-base font-semibold">
            {title}
          </h2>
          <Badge variant="secondary">{types.length}</Badge>
        </CardHeader>
        <CardContent>
          {types.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {types.map((type) => (
                <li key={type.slug} className="flex items-center justify-between gap-4 py-2">
                  <Link
                    to={`/admin/content-types/${encodeURIComponent(type.slug)}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {type.name}
                  </Link>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {type.slug}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
ContentTypeGroup.displayName = 'ContentTypeGroup';

/**
 * `/admin/content-types` (gated by `content_type:read`): every content type, grouped into single
 * and collection types, with a light Card restyle (AC-39). The full screen arrives in Phase 5.
 */
const ContentTypesPage: React.FC = () => {
  const { data, isPending, isError } = useContentTypes();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Content types</h1>
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load content types.
        </p>
      ) : isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading content types…
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ContentTypeGroup
            title="Single types"
            types={data.filter((type) => type.kind === 'single')}
          />
          <ContentTypeGroup
            title="Collection types"
            types={data.filter((type) => type.kind === 'collection')}
          />
        </div>
      )}
    </section>
  );
};
ContentTypesPage.displayName = 'ContentTypesPage';

export default ContentTypesPage;
