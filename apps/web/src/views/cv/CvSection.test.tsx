import { render, screen } from '@testing-library/react';

import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import {
  CvSection,
  ExternalLink,
  groupSkillsByLevel,
  LanguagesSection,
  MaskedPlaceholder,
  MaskedTextContext,
  SkillsSection,
  SummarySection,
} from './CvSection';
import type { PageCvA } from './PageCv.graphql';

const TEXT = PAGE_CV_MOCK.cvCommonText;
const MASKED_TEXT = 'Sign in to view';

function cvOf(overrides: Partial<PageCvA> = {}): PageCvA {
  return {
    documentId: 'c1',
    name: 'Mai Tran',
    position: null,
    summary: '<p>Builds <strong>calm</strong> systems.</p>',
    skills: [{ skill: 'TypeScript', level: 'Expert' }],
    experiences: null,
    projects: null,
    educations: null,
    languages: null,
    references: null,
    _maskedFields: [],
    ...overrides,
  };
}

function renderWithMask(ui: React.ReactNode) {
  return render(<MaskedTextContext.Provider value={MASKED_TEXT}>{ui}</MaskedTextContext.Provider>);
}

describe('SummarySection', () => {
  it('renders the summary richtext under its title', () => {
    renderWithMask(<SummarySection cv={cvOf()} text={TEXT} />);
    expect(screen.getByRole('heading', { level: 2, name: TEXT.summary })).toBeInTheDocument();
    expect(screen.getByText('calm')).toBeInTheDocument();
  });

  it('renders the summary without a title when there is no text', () => {
    render(<SummarySection cv={cvOf()} text={null} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('calm')).toBeInTheDocument();
  });

  it('leaves a masked summary out when there is no masked text', () => {
    const { container } = render(
      <SummarySection cv={cvOf({ summary: '***', _maskedFields: ['summary'] })} text={TEXT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty summary', () => {
    renderWithMask(<SummarySection cv={cvOf({ summary: null })} text={TEXT} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the placeholder, never the raw value, for a masked summary', () => {
    const { container } = renderWithMask(
      <SummarySection cv={cvOf({ summary: '***', _maskedFields: ['summary'] })} text={TEXT} />,
    );
    expect(screen.getByText(MASKED_TEXT)).toBeInTheDocument();
    expect(container).not.toHaveTextContent('***');
  });
});

describe('groupSkillsByLevel', () => {
  it('groups the skills by level in the order each level first appears', () => {
    expect(
      groupSkillsByLevel([
        { skill: 'React', level: 'Proficient' },
        { skill: 'Vite', level: 'Intermediate' },
        { skill: 'Next.js', level: 'Proficient' },
        { skill: null, level: 'Others' },
        { skill: 'Jira', level: null },
      ]),
    ).toEqual([
      { level: 'Proficient', skills: ['React', 'Next.js'] },
      { level: 'Intermediate', skills: ['Vite'] },
      { level: '', skills: ['Jira'] },
    ]);
  });
});

describe('SkillsSection', () => {
  it('shows each level once with its skills', () => {
    render(
      <SkillsSection
        cv={cvOf({
          skills: [
            { skill: 'React', level: 'Proficient' },
            { skill: 'Next.js', level: 'Proficient' },
          ],
        })}
        text={TEXT}
      />,
    );
    expect(screen.getAllByText('Proficient')).toHaveLength(1);
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Next.js')).toBeInTheDocument();
  });

  it('lists each skill with its level', () => {
    renderWithMask(<SkillsSection cv={cvOf()} text={TEXT} />);
    expect(screen.getByRole('heading', { level: 2, name: TEXT.skills })).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText(/Expert/)).toBeInTheDocument();
  });

  it('lists the skills without a title when there is no text', () => {
    render(<SkillsSection cv={cvOf()} text={null} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('renders nothing when no skill has a name', () => {
    renderWithMask(
      <SkillsSection cv={cvOf({ skills: [{ skill: null, level: 'Expert' }] })} text={TEXT} />,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('ExternalLink', () => {
  it('opens a safe target in a new tab without an opener', () => {
    render(<ExternalLink href="https://example.com">site</ExternalLink>);
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('renders an unsafe target as text', () => {
    render(<ExternalLink href="javascript:alert(1)">site</ExternalLink>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('site')).toBeInTheDocument();
  });
});

describe('CvSection', () => {
  it('renders a title only when it has text', () => {
    const { rerender } = render(<CvSection title="Skills">x</CvSection>);
    expect(screen.getByRole('heading', { level: 2, name: 'Skills' })).toBeInTheDocument();
    rerender(<CvSection title={null}>x</CvSection>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    rerender(<CvSection>x</CvSection>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('MaskedPlaceholder', () => {
  it('renders nothing without masked text, never a crash', () => {
    const { container } = render(<MaskedPlaceholder />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the masked text when it is provided', () => {
    renderWithMask(<MaskedPlaceholder />);
    expect(screen.getByText(MASKED_TEXT)).toBeInTheDocument();
  });
});

describe('LanguagesSection', () => {
  it('lists each language with its level under the title', () => {
    render(
      <LanguagesSection
        cv={cvOf({ languages: [{ language: 'Vietnamese', level: 'Native' }] })}
        text={TEXT}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: TEXT.languages })).toBeInTheDocument();
    expect(screen.getByText('Vietnamese')).toBeInTheDocument();
    expect(screen.getByText('Native')).toBeInTheDocument();
  });

  it('renders nothing when no language has a name', () => {
    const { container } = render(
      <LanguagesSection
        cv={cvOf({ languages: [{ language: ' ', level: 'Native' }] })}
        text={TEXT}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
