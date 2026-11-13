import { render, screen } from '@testing-library/react';

import { CV_PAGE_MOCK } from '@/apis/server/graphql/mocks/CvPage.mock';
import { CvContact } from '@/features/cv/Cv.graphql';

import { ContactCard } from './ContactCard';
import { MaskedTextContext } from './ResumeSections';

function contactOf(overrides: Partial<CvContact> = {}): CvContact {
  return {
    name: 'Mai Tran',
    address: '12 Example Street, Hanoi',
    phone: '+84 555 0100',
    email: 'mai@example.com',
    linkedin: 'https://www.linkedin.com/in/mai-example',
    github: 'https://github.com/mai-example',
    avatar: null,
    _maskedFields: [],
    ...overrides,
  };
}

const FALLBACK = 'Mai Tran';
const TEXT = CV_PAGE_MOCK.cvPageText.contact;

function Card(props: { contact: CvContact | null; fallbackName: string }) {
  return (
    <MaskedTextContext.Provider value={CV_PAGE_MOCK.cvPageText.maskedValue}>
      <ContactCard {...props} text={TEXT} />
    </MaskedTextContext.Provider>
  );
}

describe('ContactCard', () => {
  it('renders readable values as links where a link makes sense', () => {
    render(<Card contact={contactOf()} fallbackName={FALLBACK} />);

    expect(screen.getByRole('heading', { level: 2, name: TEXT.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mai@example.com' })).toHaveAttribute(
      'href',
      'mailto:mai@example.com',
    );
    expect(screen.getByRole('link', { name: '+84 555 0100' })).toHaveAttribute(
      'href',
      'tel:+845550100',
    );
    expect(screen.getByRole('link', { name: 'https://github.com/mai-example' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByText('12 Example Street, Hanoi')).toBeInTheDocument();
  });

  it('shows initials when there is no avatar', () => {
    render(<Card contact={contactOf()} fallbackName={FALLBACK} />);
    expect(screen.getByText('MT')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the avatar image with its alt text when present', () => {
    render(
      <Card
        contact={contactOf({
          avatar: { url: 'https://res.cloudinary.com/x/a.png', alt: 'Mai' },
        })}
        fallbackName={FALLBACK}
      />,
    );
    expect(screen.getByRole('img', { name: 'Mai' })).toBeInTheDocument();
  });

  it('shows the placeholder and none of the masked values', () => {
    const { container } = render(
      <Card
        contact={contactOf({
          address: '***',
          phone: '***',
          email: '***',
          github: null,
          _maskedFields: ['address', 'phone', 'email', 'github'],
        })}
        fallbackName={FALLBACK}
      />,
    );
    expect(screen.getAllByText(CV_PAGE_MOCK.cvPageText.maskedValue)).toHaveLength(4);
    expect(container).not.toHaveTextContent('***');
    expect(screen.queryByRole('link', { name: /mailto|tel:/ })).toBeNull();
    expect(screen.getByRole('link', { name: /linkedin/ })).toBeInTheDocument();
  });

  it('does not link a value that is not a safe target', () => {
    render(
      <Card
        contact={contactOf({
          linkedin: 'javascript:alert(1)',
          email: 'not an email',
        })}
        fallbackName={FALLBACK}
      />,
    );
    expect(screen.queryByRole('link', { name: /javascript/ })).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.getByText('not an email')).toBeInTheDocument();
  });

  it('renders nothing without a contact or without any value', () => {
    const { container, rerender } = render(<Card contact={null} fallbackName={FALLBACK} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <Card
        contact={contactOf({
          address: null,
          phone: '',
          email: null,
          linkedin: null,
          github: null,
        })}
        fallbackName={FALLBACK}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
