import { render, screen, within } from '@testing-library/react';

import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import type { PageCvA } from './PageCv.graphql';
import { ProjectsSection } from './ProjectsSection';

const TEXT = PAGE_CV_MOCK.pageCvText;

function cvOf(overrides: Partial<PageCvA> = {}): PageCvA {
  return {
    documentId: 'c1',
    name: null,
    position: null,
    summary: null,
    skills: null,
    experiences: null,
    projects: [
      {
        name: 'Billing core',
        teamSize: 4,
        role: 'Owner',
        liveLink: 'https://billing.example.com',
        repositoryLink: 'javascript:alert(1)',
        techStack: ['NestJS'],
        responsibilities: '<p>Designed the invoicing model.</p>',
      },
    ],
    educations: null,
    _maskedFields: [],
    ...overrides,
  };
}

describe('ProjectsSection', () => {
  it('renders each top-level project under the projects title', () => {
    render(<ProjectsSection cv={cvOf()} text={TEXT} />);
    expect(
      screen.getByRole('heading', { level: 2, name: TEXT.sections.projects }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Billing core' })).toBeInTheDocument();
    expect(screen.getByText('Owner · Team of 4')).toBeInTheDocument();
    expect(screen.getByText('NestJS')).toBeInTheDocument();
    expect(screen.getByText('Designed the invoicing model.')).toBeInTheDocument();
  });

  it('links with accessible names and refuses an unsafe target', () => {
    render(<ProjectsSection cv={cvOf()} text={TEXT} />);
    const project = screen.getByRole('heading', { name: 'Billing core' })
      .parentElement as HTMLElement;

    const live = within(project).getByRole('link', { name: 'Live site of Billing core' });
    expect(live).toHaveAttribute('href', 'https://billing.example.com');
    expect(live).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(project).queryByRole('link', { name: /Repository/ })).toBeNull();
    expect(project.innerHTML).not.toContain('javascript:');
  });

  it('names an unnamed project with the page text', () => {
    render(
      <ProjectsSection
        cv={cvOf({
          projects: [
            {
              name: null,
              teamSize: null,
              role: null,
              liveLink: null,
              repositoryLink: null,
              techStack: null,
              responsibilities: null,
            },
          ],
        })}
        text={TEXT}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: TEXT.project.unnamedProject }),
    ).toBeInTheDocument();
  });

  it('renders nothing without projects', () => {
    render(<ProjectsSection cv={cvOf({ projects: null })} text={TEXT} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
