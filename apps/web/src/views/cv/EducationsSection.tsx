import { CvSection, hasText, MUTED_CLASS } from './CvSection';
import type { PageCvA, PageCvText } from './PageCv.graphql';

export function EducationsSection({ cv, text }: { cv: PageCvA; text: PageCvText }) {
  const { educations } = cv;
  if (educations === null) return null;
  const details = [educations.institution, educations.period, educations.location].filter(hasText);
  if (!hasText(educations.degree) && details.length === 0) return null;
  return (
    <CvSection title={text.sections.educations}>
      <h3 className="text-base font-medium">{educations.degree}</h3>
      <p className={MUTED_CLASS}>{details.join(' · ')}</p>
    </CvSection>
  );
}
