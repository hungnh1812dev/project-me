import {
  CvSection,
  ExternalLink,
  hasText,
  MUTED_CLASS,
  Richtext,
  teamSizeText,
  TechStack,
} from './CvSection';
import type { CvCommonText, PageCvA, PageCvProject } from './PageCv.graphql';

function ProjectItem({ project, text }: { project: PageCvProject; text: CvCommonText | null }) {
  return (
    <li className="mt-6 first:mt-0">
      {hasText(project.name) ? <h3 className="text-base font-medium">{project.name}</h3> : null}
      <p className={MUTED_CLASS}>
        {[
          hasText(project.role) ? project.role : null,
          teamSizeText(text?.teamSize, project.teamSize),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {hasText(project.liveLink) || hasText(project.repositoryLink) ? (
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {hasText(project.liveLink) ? (
            <ExternalLink href={project.liveLink}>{project.liveLink}</ExternalLink>
          ) : null}
          {hasText(project.repositoryLink) ? (
            <ExternalLink href={project.repositoryLink}>{project.repositoryLink}</ExternalLink>
          ) : null}
        </p>
      ) : null}
      <TechStack value={project.techStack} label={text?.technologies} />
      {hasText(project.responsibilities) ? (
        <div className="mt-2">
          <Richtext html={project.responsibilities} />
        </div>
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
