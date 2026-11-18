import { render, screen } from '@testing-library/react';

import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import { EducationsSection } from './EducationsSection';
import type { PageCvA } from './PageCv.graphql';

const TEXT = PAGE_CV_MOCK.cvCommonText;

function cvOf(educations: PageCvA['educations']): PageCvA {
  return {
    documentId: 'c1',
    name: null,
    position: null,
    summary: null,
    skills: null,
    experiences: null,
    projects: null,
    educations,
    _maskedFields: [],
  };
}

describe('EducationsSection', () => {
  it('renders the degree and its details', () => {
    render(
      <EducationsSection
        cv={cvOf([
          {
            degree: 'BSc Computer Science',
            institution: 'Example University',
            period: '2016 - 2020',
            location: null,
          },
          { degree: 'MSc Software Engineering', institution: null, period: null, location: null },
        ])}
        text={TEXT}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: TEXT.educations })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'BSc Computer Science' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Example University · 2016 - 2020')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'MSc Software Engineering' }),
    ).toBeInTheDocument();
  });

  it('renders the degrees without a title when there is no text', () => {
    render(
      <EducationsSection
        cv={cvOf([{ degree: 'BSc', institution: null, period: null, location: null }])}
        text={null}
      />,
    );
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'BSc' })).toBeInTheDocument();
  });

  it('renders nothing for a null or empty education', () => {
    const { rerender } = render(<EducationsSection cv={cvOf(null)} text={TEXT} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    rerender(
      <EducationsSection
        cv={cvOf([{ degree: null, institution: ' ', period: null, location: null }])}
        text={TEXT}
      />,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    rerender(<EducationsSection cv={cvOf([])} text={TEXT} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
