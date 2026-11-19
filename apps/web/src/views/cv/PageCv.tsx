import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';

import { Richtext } from './CvSection';
import { PageCvClient } from './PageCv.client';
import { loadPageCv } from './PageCv.data';

/** The meta tag of every `/cv` response, the not-found one included (public-site PS-5). */
export const CV_ROBOTS_METADATA: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export interface PageCvProps {
  params: Promise<{ documentId: string }>;
}

export async function generateMetadata({ params }: PageCvProps): Promise<Metadata> {
  const content = await loadPageCv((await params).documentId);
  if (content.state !== 'cv') return CV_ROBOTS_METADATA;
  const { name, position } = content.data.pageCvA;
  if (!name) return CV_ROBOTS_METADATA;
  return { ...CV_ROBOTS_METADATA, title: position ? `${name} - ${position}` : name };
}

export default async function PageCv({ params }: PageCvProps) {
  const content = await loadPageCv((await params).documentId);
  if (content.state === 'not-found') notFound();
  if (content.state === 'no-cv-live') {
    const { noCvText } = content.text ?? {};
    return noCvText ? <Richtext html={noCvText} /> : <p>{LAST_RESORT_TEXT.noCvLive}</p>;
  }
  return <PageCvClient initialData={content.data} text={content.text} />;
}
