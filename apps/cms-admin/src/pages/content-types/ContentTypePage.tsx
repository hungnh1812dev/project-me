import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import type { ApiError } from '@/core/api/apiError';
import { useDocumentList } from '@/features/content/hooks/useCollectionQueries';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import { useContentType } from '@/features/content/hooks/useContentTypes';
import { useSingleTypeDocument } from '@/features/content/hooks/useSingleType';
import type { ContentType, ListedDocumentItem, ListParams } from '@/features/content/types';

const FORBIDDEN = "You don't have access to this content type.";

const Forbidden: React.FC = () => <p role="alert">{FORBIDDEN}</p>;
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
  if (error) return <p role="alert">Couldn't load the documents.</p>;
  if (isPending) return <p role="status">Loading documents…</p>;
  return (
    <>
      <table aria-label="Documents">
        <thead>
          <tr>
            {type.listFields.map((field) => (
              <th key={field}>{field}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.documentId}>
              {type.listFields.map((field) => (
                <td key={field}>{cellText(item, field)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{data.total} total</p>
    </>
  );
};
CollectionDocuments.displayName = 'CollectionDocuments';

const SingleDocument: React.FC<{ type: ContentType }> = ({ type }) => {
  const access = useContentTypeAccess(type);
  const { data, error, isPending } = useSingleTypeDocument(type);

  if (!access.read.allowed || isForbidden(error)) return <Forbidden />;
  if (error) return <p role="alert">Couldn't load the document.</p>;
  if (isPending) return <p role="status">Loading document…</p>;
  return <p>{data ? `Status: ${data.status}` : 'Not saved yet'}</p>;
};
SingleDocument.displayName = 'SingleDocument';

/**
 * `/admin/content-types/:slug`: unstyled, read-only placeholder (gated by `content_type:read`). It
 * shows the content type's name, kind and fields, then the first page of a collection type (with
 * `orderBy` and `sortDir` taken from the URL) or the status of a single type. The styled screens
 * arrive in Phase 5.
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
        <p role="alert">Content type not found.</p>
      </section>
    );
  if (error)
    return (
      <section>
        <p role="alert">Couldn't load this content type.</p>
      </section>
    );
  if (isPending)
    return (
      <section>
        <p role="status">Loading content type…</p>
      </section>
    );

  return (
    <section>
      <h1>{type.name}</h1>
      <p>Kind: {type.kind === 'single' ? 'Single type' : 'Collection type'}</p>
      <h2 id="content-type-fields">Fields</h2>
      <ul aria-labelledby="content-type-fields">
        {type.fields.map((field) => (
          <li key={field.name}>{field.name}</li>
        ))}
      </ul>
      {type.kind === 'single' ? (
        <SingleDocument type={type} />
      ) : (
        <CollectionDocuments type={type} />
      )}
    </section>
  );
};
ContentTypePage.displayName = 'ContentTypePage';

export default ContentTypePage;
