import { CvSection, hasText, KEEP_TOGETHER_CLASS } from './CvSection';
import type { CvCommonText, PageCvA, PageCvEducation } from './PageCv.graphql';

function detailsOf({ period, degree, location }: PageCvEducation): string[] {
  return [period, degree, location].filter(hasText);
}

function hasContent(education: PageCvEducation): boolean {
  return hasText(education.institution) || detailsOf(education).length > 0;
}

export function EducationsSection({ cv, text }: { cv: PageCvA; text: CvCommonText | null }) {
  const educations = (cv.educations ?? []).filter(hasContent);
  if (educations.length === 0) return null;
  return (
    <CvSection title={text?.educations}>
      <ul className="space-y-4">
        {educations.map((education, index) => (
          <li key={index} className={KEEP_TOGETHER_CLASS}>
            {hasText(education.institution) ? (
              <h3 className="text-cv-text text-base font-bold">{education.institution}</h3>
            ) : null}
            <p className="text-cv-muted mt-0.5 flex flex-wrap items-center gap-x-3 text-sm">
              {detailsOf(education).map((detail, detailIndex) => (
                <span
                  key={detailIndex}
                  className="border-cv-rule [&:not(:first-child)]:border-l [&:not(:first-child)]:pl-3"
                >
                  {detail}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
