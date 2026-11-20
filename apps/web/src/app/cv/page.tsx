import { notFound } from 'next/navigation';

/** `/cv` lists nothing: a CV is served on `/cv/<documentId>` only (public-site PS-5). */
export default function CvIndexPage(): never {
  notFound();
}
