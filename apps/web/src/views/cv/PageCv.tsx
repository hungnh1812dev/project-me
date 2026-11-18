import type { Metadata } from 'next';

import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';

import { Richtext } from './CvSection';
import { PageCvClient } from './PageCv.client';
import { loadPageCv } from './PageCv.data';
import { mainCvOf } from './PageCv.graphql';

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadPageCv();
  if (content.state === 'no-cv-live') return { robots: { index: false } };
  const cv = mainCvOf(content.data);
  if (!cv?.name) return {};
  return { title: cv.position ? `${cv.name} - ${cv.position}` : cv.name };
}

export default async function PageCv() {
  const content = await loadPageCv();
  if (content.state === 'no-cv-live') {
    const { noCvText } = content.text ?? {};
    return noCvText ? <Richtext html={noCvText} /> : <p>{LAST_RESORT_TEXT.noCvLive}</p>;
  }
  return <PageCvClient initialData={content.data} text={content.text} />;
}
