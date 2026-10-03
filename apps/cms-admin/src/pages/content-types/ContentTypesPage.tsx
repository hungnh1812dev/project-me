import { ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useContentTypes } from '@/features/content/hooks/useContentTypes';
import type { ContentTypeSummary } from '@/features/content/types';

const KIND_LABEL = { single: 'Single type', collection: 'Collection type' } as const;

/** One content type: a card whose name links to its page (the whole card is the target). */
const ContentTypeCard: React.FC<{ type: ContentTypeSummary }> = ({ type }) => (
  <Card className="relative flex-row items-center gap-3 p-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50">
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Link
        to={`/admin/content-types/${encodeURIComponent(type.slug)}`}
        className="truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-[inherit]"
      >
        {type.name}
      </Link>
      <span className="truncate font-mono text-xs text-muted-foreground">{type.slug}</span>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{KIND_LABEL[type.kind]}</Badge>
        <span className="text-xs text-muted-foreground">
          {type.draftToPublish ? 'Draft & publish' : 'No draft & publish'}
        </span>
      </div>
    </div>
    <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
  </Card>
);
ContentTypeCard.displayName = 'ContentTypeCard';

interface GroupProps {
  title: string;
  types: ContentTypeSummary[];
}

const ContentTypeGroup: React.FC<GroupProps> = ({ title, types }) => {
  const headingId = `content-types-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <Badge variant="outline">{types.length}</Badge>
      </div>
      {types.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          None yet.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {types.map((type) => (
            <li key={type.slug}>
              <ContentTypeCard type={type} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
ContentTypeGroup.displayName = 'ContentTypeGroup';

/**
 * `/admin/content-types` (gated by `content_type:read`): every content type as a card, grouped into
 * single and collection types, each showing its kind and whether it uses draft and publish, and
 * linking to its page. A server 403 shows the no-access state; no types at all shows an empty state.
 */
const ContentTypesPage: React.FC = () => {
  const { data, isPending, error } = useContentTypes();

  let body: React.ReactNode;
  if (error)
    body = (
      <p role="alert" className="text-sm text-destructive">
        {error.status === 403
          ? "You don't have access to content types."
          : "Couldn't load content types."}
      </p>
    );
  else if (isPending)
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        Loading content types…
      </p>
    );
  else if (data.length === 0)
    body = (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No content types yet.
      </p>
    );
  else
    body = (
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
    );

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Content types</h1>
      {body}
    </section>
  );
};
ContentTypesPage.displayName = 'ContentTypesPage';

export default ContentTypesPage;
