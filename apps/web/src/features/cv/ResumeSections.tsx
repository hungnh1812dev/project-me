import type { ReactNode } from 'react';

import { COPY } from '../../config/Copy.constants';
import { isSafeLinkTarget } from '../../lib/SafeLinkTarget.rules';
import {
  isMaskedField,
  type Resume,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeProject,
  type ResumeRole,
} from './Cv.graphql';

const LINK_CLASS = 'text-primary underline-offset-4 hover:underline';
const SECTION_TITLE_CLASS = 'text-lg font-semibold tracking-tight';
const MUTED_CLASS = 'text-sm text-muted-foreground';
const RICHTEXT_CLASS =
  'text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5';

/** Stands in for a value the visitor's role may not read. */
export function MaskedPlaceholder() {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-sm text-muted-foreground italic">
      {COPY.cv.maskedValue}
    </span>
  );
}

/** A link that opens in a new tab; a target that is not safe renders as text. */
export function ExternalLink({
  href,
  label,
  children,
}: {
  href: string;
  /** Accessible name when the visible text alone is not enough. */
  label?: string;
  children: ReactNode;
}) {
  if (!isSafeLinkTarget(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {children}
    </a>
  );
}

/** Richtext that has already been through `sanitizeCvRichtext`. */
function Richtext({ html }: { html: string }) {
  return (
    <div
      className={RICHTEXT_CLASS}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className={SECTION_TITLE_CLASS}>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function nonEmpty<T>(items: T[] | null | undefined): T[] {
  return items ?? [];
}

function techStackOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(hasText) : [];
}

function TechStack({ value }: { value: unknown }) {
  const items = techStackOf(value);
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={COPY.cv.experience.techStack}
      className="mt-2 flex flex-wrap gap-1.5"
    >
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SummarySection({ resume }: { resume: Resume }) {
  const isMasked = isMaskedField(resume, 'summary');
  if (!isMasked && !hasText(resume.summary)) return null;
  return (
    <Section title={COPY.cv.sections.summary}>
      {isMasked || !hasText(resume.summary) ? (
        <MaskedPlaceholder />
      ) : (
        <Richtext html={resume.summary} />
      )}
    </Section>
  );
}

export function SkillsSection({ resume }: { resume: Resume }) {
  const skills = nonEmpty(resume.skills).filter((entry) =>
    hasText(entry.skill),
  );
  if (skills.length === 0) return null;
  return (
    <Section title={COPY.cv.sections.skills}>
      <ul className="flex flex-wrap gap-2">
        {skills.map((entry, index) => (
          <li
            key={`${entry.skill}-${index}`}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-sm"
          >
            {entry.skill}
            {hasText(entry.level) ? (
              <span className="text-muted-foreground"> · {entry.level}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ProjectItem({ project }: { project: ResumeProject }) {
  const name = project.name ?? COPY.cv.experience.unnamedProject;
  return (
    <li className="mt-4">
      <h4 className="text-sm font-medium">{name}</h4>
      <p className={MUTED_CLASS}>
        {[
          hasText(project.role) ? project.role : null,
          project.teamSize === null
            ? null
            : COPY.cv.experience.teamSize(project.teamSize),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {hasText(project.liveLink) || hasText(project.repositoryLink) ? (
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {hasText(project.liveLink) ? (
            <ExternalLink
              href={project.liveLink}
              label={COPY.cv.experience.liveLinkName(name)}
            >
              {COPY.cv.experience.liveLink}
            </ExternalLink>
          ) : null}
          {hasText(project.repositoryLink) ? (
            <ExternalLink
              href={project.repositoryLink}
              label={COPY.cv.experience.repositoryLinkName(name)}
            >
              {COPY.cv.experience.repositoryLink}
            </ExternalLink>
          ) : null}
        </p>
      ) : null}
      <TechStack value={project.techStack} />
      {hasText(project.responsibilities) ? (
        <div className="mt-2">
          <Richtext html={project.responsibilities} />
        </div>
      ) : null}
    </li>
  );
}

function RoleItem({ role }: { role: ResumeRole }) {
  const projects = nonEmpty(role.projects);
  return (
    <li className="mt-4">
      <p className="text-sm font-medium">{role.position}</p>
      <p className={MUTED_CLASS}>
        {[
          hasText(role.period) ? role.period : null,
          role.teamSize === null
            ? null
            : COPY.cv.experience.teamSize(role.teamSize),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <TechStack value={role.techStack} />
      {hasText(role.responsibilities) ? (
        <div className="mt-2">
          <Richtext html={role.responsibilities} />
        </div>
      ) : null}
      {projects.length > 0 ? (
        <ul className="mt-2 border-l border-border pl-4">
          {projects.map((project, index) => (
            <ProjectItem key={`${project.name}-${index}`} project={project} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ExperienceItem({
  experience,
  isCompanyMasked,
}: {
  experience: ResumeExperience;
  isCompanyMasked: boolean;
}) {
  const roles = nonEmpty(experience.roles);
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
            <RoleItem key={`${role.position}-${index}`} role={role} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ExperienceSection({ resume }: { resume: Resume }) {
  const experiences = nonEmpty(resume.experiences);
  if (experiences.length === 0) return null;
  const isCompanyMasked = isMaskedField(resume, 'experiences.company');
  return (
    <Section title={COPY.cv.sections.experiences}>
      <ul>
        {experiences.map((experience, index) => (
          <ExperienceItem
            key={`${experience.company}-${index}`}
            experience={experience}
            isCompanyMasked={isCompanyMasked}
          />
        ))}
      </ul>
    </Section>
  );
}

function EducationItem({ education }: { education: ResumeEducation }) {
  return (
    <li className="mt-6 first:mt-0">
      <h3 className="text-base font-medium">{education.degree}</h3>
      <p className={MUTED_CLASS}>
        {[education.institution, education.period, education.location]
          .filter(hasText)
          .join(' · ')}
      </p>
      {hasText(education.description) ? (
        <div className="mt-2">
          <Richtext html={education.description} />
        </div>
      ) : null}
    </li>
  );
}

export function EducationSection({ resume }: { resume: Resume }) {
  const educations = nonEmpty(resume.educations);
  if (educations.length === 0) return null;
  return (
    <Section title={COPY.cv.sections.educations}>
      <ul>
        {educations.map((education, index) => (
          <EducationItem
            key={`${education.degree}-${index}`}
            education={education}
          />
        ))}
      </ul>
    </Section>
  );
}

export function LanguagesSection({ resume }: { resume: Resume }) {
  const languages = nonEmpty(resume.languages).filter((entry) =>
    hasText(entry.language),
  );
  if (languages.length === 0) return null;
  return (
    <Section title={COPY.cv.sections.languages}>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {languages.map((entry, index) => (
          <li key={`${entry.language}-${index}`}>
            {entry.language}
            {hasText(entry.level) ? (
              <span className="text-muted-foreground"> · {entry.level}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RefereesSection({ resume }: { resume: Resume }) {
  const referees = nonEmpty(resume.referees);
  if (referees.length === 0) return null;
  const isPhoneMasked = isMaskedField(resume, 'referees.phone');
  return (
    <Section title={COPY.cv.sections.referees}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {referees.map((referee, index) => (
          <li key={`${referee.name}-${index}`} className="text-sm">
            <p className="font-medium">{referee.name}</p>
            {hasText(referee.role) ? (
              <p className="text-muted-foreground">{referee.role}</p>
            ) : null}
            {isPhoneMasked || hasText(referee.phone) ? (
              <p>
                <span className="text-muted-foreground">
                  {COPY.cv.referee.phone}:{' '}
                </span>
                {isPhoneMasked ? <MaskedPlaceholder /> : referee.phone}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Every resume section in reading order; an empty one renders nothing. */
export function ResumeSections({ resume }: { resume: Resume }) {
  return (
    <>
      <SummarySection resume={resume} />
      <SkillsSection resume={resume} />
      <ExperienceSection resume={resume} />
      <EducationSection resume={resume} />
      <LanguagesSection resume={resume} />
      <RefereesSection resume={resume} />
    </>
  );
}
