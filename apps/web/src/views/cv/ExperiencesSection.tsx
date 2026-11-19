import {
  CvSection,
  hasText,
  KEEP_TOGETHER_CLASS,
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

function RoleItem({
  role,
  text,
  isUnderCompany,
}: {
  role: PageCvRole;
  text: CvCommonText | null;
  /** True when the company heading (h3) is shown, so the role sits one level below it. */
  isUnderCompany: boolean;
}) {
  const RoleHeading = isUnderCompany ? 'h4' : 'h3';
  const details = [role.projects, teamSizeText(text?.teamSize, role.teamSize)].filter(hasText);
  return (
    <li className="mt-5 first:mt-4">
      <div
        className={`flex break-after-avoid flex-wrap items-baseline justify-between gap-x-4 ${KEEP_TOGETHER_CLASS}`}
      >
        {hasText(role.position) ? (
          <RoleHeading className="text-cv-text text-sm font-semibold tracking-wide uppercase">
            {role.position}
          </RoleHeading>
        ) : null}
        {hasText(role.period) ? <p className={MUTED_CLASS}>{role.period}</p> : null}
      </div>
      {details.length > 0 ? <p className={`mt-0.5 ${MUTED_CLASS}`}>{details.join(' · ')}</p> : null}
      {hasText(role.responsibilities) ? (
        <div className="text-cv-text mt-1.5">
          <Richtext html={role.responsibilities} />
        </div>
      ) : null}
      <TechStack value={role.techStacks} label={text?.technologies} />
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
  const details = [experience.location, experience.period].filter(hasText);
  const roles = experience.roles ?? [];
  return (
    <li className="mt-8 first:mt-0">
      {heading === null && details.length === 0 ? null : (
        <div
          className={`border-cv-ink bg-cv-band flex break-after-avoid flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-r-md border-l-4 px-4 py-2 ${KEEP_TOGETHER_CLASS}`}
        >
          {heading === null ? null : (
            <h3 className="text-cv-ink text-base font-bold uppercase">{heading}</h3>
          )}
          {details.length > 0 ? <p className={MUTED_CLASS}>{details.join(' · ')}</p> : null}
        </div>
      )}
      {roles.length > 0 ? (
        <ul>
          {roles.map((role, index) => (
            <RoleItem
              key={`${role.position}-${index}`}
              role={role}
              text={text}
              isUnderCompany={heading !== null}
            />
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
