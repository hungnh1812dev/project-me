import { formatText } from '@/utils/TextTemplate.rules';

import {
  CvSection,
  hasText,
  MaskedPlaceholder,
  MUTED_CLASS,
  Richtext,
  TechStack,
} from './CvSection';
import {
  isMaskedField,
  type PageCvA,
  type PageCvExperience,
  type PageCvRole,
  type PageCvText,
} from './PageCv.graphql';

function RoleItem({ role, text }: { role: PageCvRole; text: PageCvText }) {
  return (
    <li className="mt-4">
      <p className="text-sm font-medium">{role.position}</p>
      <p className={MUTED_CLASS}>
        {[
          hasText(role.period) ? role.period : null,
          role.teamSize === null ? null : formatText(text.role.teamSize, { size: role.teamSize }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {hasText(role.projects) ? (
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">{text.role.projects}: </span>
          {role.projects}
        </p>
      ) : null}
      <TechStack value={role.techStacks} label={text.role.techStack} />
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
  text: PageCvText;
}) {
  const roles = experience.roles ?? [];
  return (
    <li className="mt-6 first:mt-0">
      <h3 className="text-base font-medium">
        {isCompanyMasked ? <MaskedPlaceholder /> : experience.company}
      </h3>
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

export function ExperiencesSection({ cv, text }: { cv: PageCvA; text: PageCvText }) {
  const experiences = cv.experiences ?? [];
  if (experiences.length === 0) return null;
  const isCompanyMasked = isMaskedField(cv, 'experiences.company');
  return (
    <CvSection title={text.sections.experiences}>
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
