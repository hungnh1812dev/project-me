import { formatText } from '@/utils/TextTemplate.rules';

import { CvSection, ExternalLink, hasText, MUTED_CLASS, Richtext, TechStack } from './CvSection';
import type { PageCvA, PageCvProject, PageCvText } from './PageCv.graphql';

function ProjectItem({ project, text }: { project: PageCvProject; text: PageCvText['project'] }) {
  const name = project.name ?? text.unnamedProject;
  return (
    <li className="mt-6 first:mt-0">
      <h3 className="text-base font-medium">{name}</h3>
      <p className={MUTED_CLASS}>
        {[
          hasText(project.role) ? project.role : null,
          project.teamSize === null ? null : formatText(text.teamSize, { size: project.teamSize }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {hasText(project.liveLink) || hasText(project.repositoryLink) ? (
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {hasText(project.liveLink) ? (
            <ExternalLink
              href={project.liveLink}
              label={formatText(text.liveLinkName, { project: name })}
            >
              {text.liveLink}
            </ExternalLink>
          ) : null}
          {hasText(project.repositoryLink) ? (
            <ExternalLink
              href={project.repositoryLink}
              label={formatText(text.repositoryLinkName, { project: name })}
            >
              {text.repositoryLink}
            </ExternalLink>
          ) : null}
        </p>
      ) : null}
      <TechStack value={project.techStack} label={text.techStack} />
      {hasText(project.responsibilities) ? (
        <div className="mt-2">
          <Richtext html={project.responsibilities} />
        </div>
      ) : null}
    </li>
  );
}

export function ProjectsSection({ cv, text }: { cv: PageCvA; text: PageCvText }) {
  const projects = cv.projects ?? [];
  if (projects.length === 0) return null;
  return (
    <CvSection title={text.sections.projects}>
      <ul>
        {projects.map((project, index) => (
          <ProjectItem key={`${project.name}-${index}`} project={project} text={text.project} />
        ))}
      </ul>
    </CvSection>
  );
}
