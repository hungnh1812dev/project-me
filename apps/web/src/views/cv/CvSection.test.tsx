import { render, screen } from '@testing-library/react';

import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import {
  ExternalLink,
  MaskedPlaceholder,
  MaskedTextContext,
  SkillsSection,
  SummarySection,
} from './CvSection';
import type { PageCvA } from './PageCv.graphql';

const TEXT = PAGE_CV_MOCK.pageCvText;

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
    _maskedFields: [],
    ...overrides,
  };
}

function renderWithMask(ui: React.ReactNode) {
  return render(
    <MaskedTextContext.Provider value={TEXT.maskedValue}>{ui}</MaskedTextContext.Provider>,
  );
}

describe('SummarySection', () => {
  it('renders the summary richtext under its title', () => {
    renderWithMask(<SummarySection cv={cvOf()} text={TEXT} />);
    expect(
      screen.getByRole('heading', { level: 2, name: TEXT.sections.summary }),
    ).toBeInTheDocument();
    expect(screen.getByText('calm')).toBeInTheDocument();
  });

  it('renders nothing for an empty summary', () => {
    renderWithMask(<SummarySection cv={cvOf({ summary: null })} text={TEXT} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the placeholder, never the raw value, for a masked summary', () => {
    const { container } = renderWithMask(
      <SummarySection cv={cvOf({ summary: '***', _maskedFields: ['summary'] })} text={TEXT} />,
    );
    expect(screen.getByText(TEXT.maskedValue)).toBeInTheDocument();
    expect(container).not.toHaveTextContent('***');
  });
});

describe('SkillsSection', () => {
  it('lists each skill with its level', () => {
    renderWithMask(<SkillsSection cv={cvOf()} text={TEXT} />);
    expect(
      screen.getByRole('heading', { level: 2, name: TEXT.sections.skills }),
    ).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText(/Expert/)).toBeInTheDocument();
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

describe('MaskedPlaceholder', () => {
  it('needs its text context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<MaskedPlaceholder />)).toThrow(/MaskedTextContext/);
  });
});
