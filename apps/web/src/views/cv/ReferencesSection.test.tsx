import { render, screen } from '@testing-library/react';

import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import { MaskedTextContext } from './CvSection';
import type { PageCvA } from './PageCv.graphql';
import { ReferencesSection } from './ReferencesSection';

const TEXT = PAGE_CV_MOCK.cvCommonText;
const MASKED_TEXT = 'Sign in to view';

function cvOf(overrides: Partial<PageCvA> = {}): PageCvA {
  return {
    documentId: 'c1',
    name: null,
    position: null,
    summary: null,
    skills: null,
    experiences: null,
    projects: null,
    educations: null,
    languages: null,
    references: [{ name: 'Mr. Huy', role: 'Technical Lead', phone: '+84 555 0199' }],
    _maskedFields: [],
    ...overrides,
  };
}

function renderSection(cv: PageCvA, maskedText: string | null = null) {
  return render(
    <MaskedTextContext.Provider value={maskedText}>
      <ReferencesSection cv={cv} text={TEXT} />
    </MaskedTextContext.Provider>,
  );
}

describe('ReferencesSection', () => {
  it('renders each reference with its role and labelled phone', () => {
    renderSection(cvOf());
    expect(screen.getByRole('heading', { level: 2, name: TEXT.reference })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Mr. Huy' })).toBeInTheDocument();
    expect(screen.getByText('Technical Lead')).toBeInTheDocument();
    expect(screen.getByText(`${TEXT.phone}:`, { exact: false })).toBeInTheDocument();
    expect(screen.getByText('+84 555 0199')).toBeInTheDocument();
  });

  it('shows the placeholder, never the phone, when it is masked', () => {
    const { container } = renderSection(
      cvOf({
        references: [{ name: 'Mr. Huy', role: null, phone: '***' }],
        _maskedFields: ['references.phone'],
      }),
      MASKED_TEXT,
    );
    expect(screen.getByText(MASKED_TEXT)).toBeInTheDocument();
    expect(container).not.toHaveTextContent('***');
  });

  it('leaves a masked phone and its label out when there is no masked text', () => {
    const { container } = renderSection(
      cvOf({
        references: [{ name: 'Mr. Huy', role: null, phone: '***' }],
        _maskedFields: ['references.phone'],
      }),
    );
    expect(container).not.toHaveTextContent('***');
    expect(container).not.toHaveTextContent(`${TEXT.phone}:`);
    expect(screen.getByRole('heading', { level: 3, name: 'Mr. Huy' })).toBeInTheDocument();
  });

  it('renders nothing when no reference has a name', () => {
    const { container } = renderSection(
      cvOf({ references: [{ name: null, role: 'Lead', phone: '1' }] }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
