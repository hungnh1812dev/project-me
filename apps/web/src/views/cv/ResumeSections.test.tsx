import { render, screen, within } from '@testing-library/react';

import { CV_PAGE_MOCK } from '@/apis/server/restful/mocks/CvPage.mock';
import { sanitizeCvRichtext, type CvPageData, type Resume } from '@/features/cv/Cv.graphql';
import { sanitizeRichtext } from '@/utils/SafeRichtext.rules';

import { MaskedTextContext, ResumeSections } from './ResumeSections';

const MASKED = '***';
const TEXT = CV_PAGE_MOCK.cvPageText;

function renderSections(resume: Resume) {
  return render(
    <MaskedTextContext.Provider value={TEXT.maskedValue}>
      <ResumeSections resume={resume} text={TEXT} />
    </MaskedTextContext.Provider>,
  );
}

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
    references: [{ name: 'Linh Pham', role: 'Director', phone: '555-0100' }],
    _maskedFields: [],
    ...overrides,
  };
}

describe('ResumeSections', () => {
  it('renders every section with h2 headings in reading order', () => {
    renderSections(resumeOf());

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      TEXT.sections.summary,
      TEXT.sections.skills,
      TEXT.sections.experiences,
      TEXT.sections.educations,
      TEXT.sections.languages,
      TEXT.sections.references,
    ]);
    expect(screen.getByText('calm')).toBeInTheDocument();
    expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });

  it('hides a section that has nothing to show', () => {
    renderSections(
      resumeOf({
        summary: null,
        skills: [],
        experiences: null,
        educations: null,
        languages: [{ language: null, level: null }],
        references: null,
      }),
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the placeholder, never the raw value, for a masked path', () => {
    const { container } = renderSections(
      resumeOf({
        summary: MASKED,
        experiences: [{ company: MASKED, location: null, period: null, roles: null }],
        references: [{ name: 'Linh Pham', role: null, phone: null }],
        _maskedFields: ['summary', 'experiences.company', 'references.phone'],
      }),
    );
    expect(screen.getAllByText(TEXT.maskedValue)).toHaveLength(3);
    expect(container).not.toHaveTextContent(MASKED);
  });

  it('keeps an unmasked company visible next to other masked fields', () => {
    renderSections(resumeOf({ _maskedFields: ['references.phone'] }));
    expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
    expect(screen.queryByText('555-0100')).not.toBeInTheDocument();
    expect(screen.getByText(TEXT.maskedValue)).toBeInTheDocument();
  });

  it('links projects with accessible names and refuses an unsafe target', () => {
    renderSections(resumeOf());
    const project = screen.getByRole('heading', { name: 'Billing core' })
      .parentElement as HTMLElement;

    const live = within(project).getByRole('link', {
      name: 'Live site of Billing core',
    });
    expect(live).toHaveAttribute('href', 'https://billing.example.com');
    expect(live).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(project).queryByRole('link', { name: /Repository/ })).toBe(null);
    expect(project.innerHTML).not.toContain('javascript:');
  });

  it('strips script handlers from richtext that went through the sanitizer', () => {
    const dirty = resumeOf({
      summary: '<p>Hi</p><img src=x onerror="window.pwned=1">',
    });
    const data: CvPageData = {
      cvPageList: { data: [dirty] },
      cvContact: null,
    };
    const [clean] = sanitizeCvRichtext(data, sanitizeRichtext).cvPageList.data;

    const { container } = renderSections(clean!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    expect(screen.getByText('Hi')).toBeInTheDocument();
  });
});
