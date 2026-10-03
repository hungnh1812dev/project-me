import { useParams } from 'react-router-dom';

/**
 * `/admin/content-types/:slug/:documentId`: the detail page of a collection entry. Stub until the
 * detail form (Phase 5.7); its heading is the documentId for now.
 */
const DocumentDetailPage: React.FC = () => {
  const { documentId = '' } = useParams();

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{documentId}</h1>
    </section>
  );
};
DocumentDetailPage.displayName = 'DocumentDetailPage';

export default DocumentDetailPage;
