import { CvSection, hasText, MUTED_CLASS } from './CvSection';
import type { CvCommonText, PageCvA, PageCvEducation } from './PageCv.graphql';

function detailsOf({ institution, period, location }: PageCvEducation): string[] {
  return [institution, period, location].filter(hasText);
}

function hasContent(education: PageCvEducation): boolean {
  return hasText(education.degree) || detailsOf(education).length > 0;
}

export function EducationsSection({ cv, text }: { cv: PageCvA; text: CvCommonText | null }) {
  const educations = (cv.educations ?? []).filter(hasContent);
  if (educations.length === 0) return null;
  return (
    <CvSection title={text?.educations}>
      <ul className="space-y-4">
        {educations.map((education, index) => (
          <li key={index}>
            <h3 className="text-base font-medium">{education.degree}</h3>
            <p className={MUTED_CLASS}>{detailsOf(education).join(' · ')}</p>
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
