import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageCvClient } from './PageCv.client';
import { loadPageCv } from './PageCv.data';
import { mainCvOf } from './PageCv.graphql';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const cv = mainCvOf((await loadPageCv()).data);
    if (!cv?.name) return {};
    return { title: cv.position ? `${cv.name} - ${cv.position}` : cv.name };
  } catch {
    // The page itself reports the failure; the title keeps the app default.
    return {};
  }
}

export default async function PageCv() {
  const { data, text } = await loadPageCv();
  if (mainCvOf(data) === undefined) notFound();
  return <PageCvClient initialData={data} text={text} />;
}
