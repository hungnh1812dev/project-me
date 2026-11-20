import {
  CvSection,
  ExternalLink,
  hasText,
  KEEP_TOGETHER_CLASS,
  MUTED_CLASS,
  Richtext,
  teamSizeText,
  TechStack,
} from './CvSection';
import type { CvCommonText, PageCvA, PageCvProject } from './PageCv.graphql';

/** "Live: <url>"; the label is left out when it is missing. */
function ProjectLink({ label, href }: { label: string | null | undefined; href: string }) {
  return (
    <p className="text-cv-muted mt-2 text-sm wrap-break-word">
      {hasText(label) ? <span className="text-cv-text font-semibold">{label}: </span> : null}
      <ExternalLink href={href}>{href}</ExternalLink>
    </p>
  );
}

function ProjectItem({ project, text }: { project: PageCvProject; text: CvCommonText | null }) {
  const teamSize = teamSizeText(text?.teamSize, project.teamSize);
  return (
    <li
      className={`border-cv-panel-edge bg-cv-panel mt-5 rounded-r-md border-l-4 px-4 py-3 first:mt-0 ${KEEP_TOGETHER_CLASS}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        {hasText(project.name) ? (
          <h3 className="text-cv-text text-base font-bold">{project.name}</h3>
        ) : null}
        {teamSize === null ? null : <p className={`${MUTED_CLASS} italic`}>{teamSize}</p>}
      </div>
      {hasText(project.role) ? <p className={MUTED_CLASS}>{project.role}</p> : null}
      {hasText(project.responsibilities) ? (
        <div className="text-cv-text mt-2">
          {hasText(text?.achievements) ? (
            <p className="text-cv-muted text-sm font-semibold">{text?.achievements}:</p>
          ) : null}
          <Richtext html={project.responsibilities} />
        </div>
      ) : null}
      <TechStack value={project.techStack} label={text?.technologies} />
      {hasText(project.liveLink) ? (
        <ProjectLink label={text?.webLink} href={project.liveLink} />
      ) : null}
      {hasText(project.repositoryLink) ? (
        <ProjectLink label={text?.projectLink} href={project.repositoryLink} />
      ) : null}
    </li>
  );
}

export function ProjectsSection({ cv, text }: { cv: PageCvA; text: CvCommonText | null }) {
  const projects = cv.projects ?? [];
  if (projects.length === 0) return null;
  return (
    <CvSection title={text?.projects}>
      <ul>
        {projects.map((project, index) => (
          <ProjectItem key={`${project.name}-${index}`} project={project} text={text} />
        ))}
      </ul>
    </CvSection>
  );
}
