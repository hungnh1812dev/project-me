import { render, screen, within } from '@testing-library/react';

import { COPY } from '../../config/Copy.constants';
import { sanitizeRichtext } from '../../lib/SafeRichtext.rules';
import { type CvPageData, type Resume, sanitizeCvRichtext } from './Cv.graphql';
import { ResumeSections } from './ResumeSections';

const MASKED = '***';

function resumeOf(overrides: Partial<Resume> = {}): Resume {
  return {
    documentId: 'r1',
    position: 'Platform engineer',
    name: 'Mai Tran',
    summary: '<p>Builds <strong>calm</strong> systems.</p>',
    skills: [{ skill: 'TypeScript', level: 'Expert' }],
    experiences: [
      {
        company: 'Northwind Labs',
        location: 'Hanoi',
        period: '2020 - 2024',
        roles: [
          {
            position: 'Tech lead',
            period: '2022 - 2024',
            teamSize: 6,
            techStack: ['Node.js', 'PostgreSQL'],
            responsibilities: '<p>Led the platform team.</p>',
            projects: [
              {
                name: 'Billing core',
                teamSize: 4,
                role: 'Owner',
                liveLink: 'https://billing.example.com',
                repositoryLink: 'javascript:alert(1)',
                techStack: null,
                responsibilities: null,
              },
            ],
          },
        ],
      },
    ],
    educations: [
      {
        degree: 'BSc Computer Science',
        institution: 'Example University',
        period: '2016 - 2020',
        location: null,
        description: null,
      },
    ],
    languages: [{ language: 'English', level: 'Fluent' }],
    referees: [{ name: 'Linh Pham', role: 'Director', phone: '555-0100' }],
    _maskedFields: [],
    ...overrides,
  };
}

describe('ResumeSections', () => {
  it('renders every section with h2 headings in reading order', () => {
    render(<ResumeSections resume={resumeOf()} />);

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      COPY.cv.sections.summary,
      COPY.cv.sections.skills,
      COPY.cv.sections.experiences,
      COPY.cv.sections.educations,
      COPY.cv.sections.languages,
      COPY.cv.sections.referees,
    ]);
    expect(screen.getByText('calm')).toBeInTheDocument();
    expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });

  it('hides a section that has nothing to show', () => {
    render(
      <ResumeSections
        resume={resumeOf({
          summary: null,
          skills: [],
          experiences: null,
          educations: null,
          languages: [{ language: null, level: null }],
          referees: null,
        })}
      />,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the placeholder, never the raw value, for a masked path', () => {
    const { container } = render(
      <ResumeSections
        resume={resumeOf({
          summary: MASKED,
          experiences: [
            { company: MASKED, location: null, period: null, roles: null },
          ],
          referees: [{ name: 'Linh Pham', role: null, phone: null }],
          _maskedFields: ['summary', 'experiences.company', 'referees.phone'],
        })}
      />,
    );
    expect(screen.getAllByText(COPY.cv.maskedValue)).toHaveLength(3);
    expect(container).not.toHaveTextContent(MASKED);
  });

  it('keeps an unmasked company visible next to other masked fields', () => {
    render(
      <ResumeSections
        resume={resumeOf({ _maskedFields: ['referees.phone'] })}
      />,
    );
    expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
    expect(screen.queryByText('555-0100')).not.toBeInTheDocument();
    expect(screen.getByText(COPY.cv.maskedValue)).toBeInTheDocument();
  });

  it('links projects with accessible names and refuses an unsafe target', () => {
    render(<ResumeSections resume={resumeOf()} />);
    const project = screen.getByRole('heading', { name: 'Billing core' })
      .parentElement as HTMLElement;

    const live = within(project).getByRole('link', {
      name: COPY.cv.experience.liveLinkName('Billing core'),
    });
    expect(live).toHaveAttribute('href', 'https://billing.example.com');
    expect(live).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(project).queryByRole('link', { name: /Repository/ })).toBe(
      null,
    );
    expect(project.innerHTML).not.toContain('javascript:');
  });

  it('strips script handlers from richtext that went through the sanitizer', () => {
    const dirty = resumeOf({
      summary: '<p>Hi</p><img src=x onerror="window.pwned=1">',
    });
    const data: CvPageData = {
      resumeList: { data: [dirty] },
      cvContact: null,
    };
    const [clean] = sanitizeCvRichtext(data, sanitizeRichtext).resumeList.data;

    const { container } = render(<ResumeSections resume={clean!} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    expect(screen.getByText('Hi')).toBeInTheDocument();
  });
});
