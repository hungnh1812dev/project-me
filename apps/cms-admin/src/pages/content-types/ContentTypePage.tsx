import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiError } from '@/core/api/apiError';
import { useDocumentList } from '@/features/content/hooks/useCollectionQueries';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import { useContentType } from '@/features/content/hooks/useContentTypes';
import type { ContentType, ListedDocumentItem, ListParams } from '@/features/content/types';

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

/** A list cell's value: a system column beside `data`, or a projected `data` field. */
function cellText(item: ListedDocumentItem, field: string): string {
  const value =
    field !== 'data' && field in item ? item[field as keyof ListedDocumentItem] : item.data[field];
  if (value === null || value === undefined) return '';
  if (typeof value === 'object')
    return 'name' in value ? String(value.name) : JSON.stringify(value);
  return String(value);
}

/** The read-only list params a placeholder page takes from its URL: `orderBy` and `sortDir`. */
function listParamsFrom(search: URLSearchParams): ListParams {
  const params: ListParams = {};
  const orderBy = search.get('orderBy');
  const sortDir = search.get('sortDir');
  if (orderBy) params.orderBy = orderBy;
  if (sortDir === 'asc' || sortDir === 'desc') params.sortDir = sortDir;
  return params;
}

const CollectionDocuments: React.FC<{ type: ContentType }> = ({ type }) => {
  const [search] = useSearchParams();
  const params = useMemo(() => listParamsFrom(search), [search]);
  const access = useContentTypeAccess(type);
  const { data, error, isPending } = useDocumentList(type, params);

  if (!access.read.allowed || isForbidden(error)) return <Forbidden />;
  if (error)
    return (
      <p role="alert" className={ALERT}>
        Couldn't load the documents.
      </p>
    );
  if (isPending)
    return (
      <p role="status" className={STATUS}>
        Loading documents…
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <Table aria-label="Documents">
        <TableHeader>
          <TableRow>
            {type.listFields.map((field) => (
              <TableHead key={field} className="font-mono text-xs">
                {field}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item) => (
            <TableRow key={item.documentId}>
              {type.listFields.map((field) => (
                <TableCell key={field}>{cellText(item, field)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className={STATUS}>{data.total} total</p>
    </div>
  );
};
CollectionDocuments.displayName = 'CollectionDocuments';

/**
 * `/admin/content-types/:slug` (gated by `content_type:read`): loads the content type, then shows
 * the single-type editor, or for a collection type the read-only placeholder list (its name, kind,
 * fields and first page, with `orderBy` and `sortDir` taken from the URL) until the list view lands.
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
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">{type.name}</h1>
          <Badge variant="secondary">Kind: Collection type</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 id="content-type-fields" className="text-base font-semibold">
              Fields
            </h2>
            <ul aria-labelledby="content-type-fields" className="flex flex-wrap gap-2 font-mono">
              {type.fields.map((field) => (
                <li
                  key={field.name}
                  className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs"
                >
                  {field.name}
                </li>
              ))}
            </ul>
          </div>
          <CollectionDocuments type={type} />
        </CardContent>
      </Card>
    </section>
  );
};
ContentTypePage.displayName = 'ContentTypePage';

export default ContentTypePage;
