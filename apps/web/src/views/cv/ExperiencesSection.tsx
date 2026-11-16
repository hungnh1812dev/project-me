import {
  CvSection,
  hasText,
  MaskedPlaceholder,
  MUTED_CLASS,
  Richtext,
  teamSizeText,
  TechStack,
  useMaskedText,
} from './CvSection';
import {
  isMaskedField,
  type CvCommonText,
  type PageCvA,
  type PageCvExperience,
  type PageCvRole,
} from './PageCv.graphql';

function RoleItem({ role, text }: { role: PageCvRole; text: CvCommonText | null }) {
  return (
    <li className="mt-4">
      <p className="text-sm font-medium">{role.position}</p>
      <p className={MUTED_CLASS}>
        {[hasText(role.period) ? role.period : null, teamSizeText(text?.teamSize, role.teamSize)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {hasText(role.projects) ? <p className="mt-1 text-sm">{role.projects}</p> : null}
      <TechStack value={role.techStacks} label={text?.technologies} />
      {hasText(role.responsibilities) ? (
        <div className="mt-2">
          <Richtext html={role.responsibilities} />
        </div>
      ) : null}
    </li>
  );
}

function ExperienceItem({
  experience,
  isCompanyMasked,
  text,
}: {
  experience: PageCvExperience;
  isCompanyMasked: boolean;
  text: CvCommonText | null;
}) {
  const maskedText = useMaskedText();
  const maskedHeading = maskedText === null ? null : <MaskedPlaceholder />;
  const heading = isCompanyMasked
    ? maskedHeading
    : hasText(experience.company)
      ? experience.company
      : null;
  const roles = experience.roles ?? [];
  return (
    <li className="mt-6 first:mt-0">
      {heading === null ? null : <h3 className="text-base font-medium">{heading}</h3>}
      <p className={MUTED_CLASS}>
        {[experience.period, experience.location].filter(hasText).join(' · ')}
      </p>
      {roles.length > 0 ? (
        <ul>
          {roles.map((role, index) => (
            <RoleItem key={`${role.position}-${index}`} role={role} text={text} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ExperiencesSection({ cv, text }: { cv: PageCvA; text: CvCommonText | null }) {
  const experiences = cv.experiences ?? [];
  if (experiences.length === 0) return null;
  const isCompanyMasked = isMaskedField(cv, 'experiences.company');
  return (
    <CvSection title={text?.experiences}>
      <ul>
        {experiences.map((experience, index) => (
          <ExperienceItem
            key={`${experience.company}-${index}`}
            experience={experience}
            isCompanyMasked={isCompanyMasked}
            text={text}
          />
        ))}
      </ul>
    </CvSection>
  );
}
