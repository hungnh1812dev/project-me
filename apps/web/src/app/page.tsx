import type { Metadata } from 'next';

import { CvView, loadCvPage, mainResumeOf } from '../features/cv';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const resume = mainResumeOf(await loadCvPage());
    if (!resume?.name) return {};
    return {
      title: resume.position
        ? `${resume.name} - ${resume.position}`
        : resume.name,
    };
  } catch {
    // The page itself reports the failure; the title keeps the app default.
    return {};
  }
}

export default async function HomePage() {
  return <CvView initialData={await loadCvPage()} />;
}
