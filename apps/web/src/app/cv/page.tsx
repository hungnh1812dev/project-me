import type { Metadata } from 'next';

import { mainResumeOf } from '../../features/cv';
import { loadCvPage } from '../../features/cv/CvPage.server';
import { CvView } from '../../views/cv/CvView';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const resume = mainResumeOf((await loadCvPage()).data);
    if (!resume?.name) return {};
    return {
      title: resume.position ? `${resume.name} - ${resume.position}` : resume.name,
    };
  } catch {
    // The page itself reports the failure; the title keeps the app default.
    return {};
  }
}

export default async function CvPage() {
  const { data, text } = await loadCvPage();
  return <CvView initialData={data} text={text} />;
}
