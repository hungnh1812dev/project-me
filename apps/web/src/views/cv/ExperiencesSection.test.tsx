import { render, screen } from '@testing-library/react';

import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import { MaskedTextContext } from './CvSection';
import { ExperiencesSection } from './ExperiencesSection';
import type { PageCvA } from './PageCv.graphql';

const TEXT = PAGE_CV_MOCK.pageCvText;

function cvOf(overrides: Partial<PageCvA> = {}): PageCvA {
  return {
    documentId: 'c1',
    name: null,
    position: null,
    summary: null,
    skills: null,
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
            projects: 'Billing core, portal',
            techStacks: ['Node.js', 'PostgreSQL'],
            responsibilities: '<p>Led the platform team.</p>',
          },
        ],
      },
    ],
    projects: null,
    educations: null,
    _maskedFields: [],
    ...overrides,
  };
}

function renderSection(cv: PageCvA) {
  return render(
    <MaskedTextContext.Provider value={TEXT.maskedValue}>
      <ExperiencesSection cv={cv} text={TEXT} />
    </MaskedTextContext.Provider>,
  );
}

describe('ExperiencesSection', () => {
  it('renders the company, its roles and the role text', () => {
    renderSection(cvOf());
    expect(
      screen.getByRole('heading', { level: 2, name: TEXT.sections.experiences }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Northwind Labs' })).toBeInTheDocument();
    expect(screen.getByText('Tech lead')).toBeInTheDocument();
    expect(screen.getByText('2022 - 2024 · Team of 6')).toBeInTheDocument();
    expect(screen.getByText('Billing core, portal')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('Led the platform team.')).toBeInTheDocument();
  });

  it('shows the placeholder, never the company, when it is masked', () => {
    const { container } = renderSection(
      cvOf({
        experiences: [{ company: '***', location: null, period: null, roles: null }],
        _maskedFields: ['experiences.company'],
      }),
    );
    expect(screen.getByText(TEXT.maskedValue)).toBeInTheDocument();
    expect(container).not.toHaveTextContent('***');
  });

  it('keeps the company visible when only other fields are masked', () => {
    renderSection(cvOf({ _maskedFields: ['summary'] }));
    expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
  });

  it('renders nothing without experiences', () => {
    renderSection(cvOf({ experiences: [] }));
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
