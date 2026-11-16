import { render, screen } from '@testing-library/react';

import { ContactCard } from './ContactCard';
import { MaskedTextContext } from './CvSection';
import type { Profile } from './PageCv.graphql';

function profileOf(overrides: Partial<Profile> = {}): Profile {
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

const MASKED_TEXT = 'Sign in to view';

function Card({
  profile,
  maskedText = null,
}: {
  profile: Profile | null;
  maskedText?: string | null;
}) {
  return (
    <MaskedTextContext.Provider value={maskedText}>
      <ContactCard profile={profile} />
    </MaskedTextContext.Provider>
  );
}

describe('ContactCard', () => {
  it('renders readable values as links where a link makes sense', () => {
    render(<Card profile={profileOf()} />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
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
    render(<Card profile={profileOf()} />);
    expect(screen.getByText('MT')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the avatar image with its alt text when present', () => {
    render(
      <Card
        profile={profileOf({
          avatar: { url: 'https://res.cloudinary.com/x/a.png', alt: 'Mai' },
        })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Mai' })).toBeInTheDocument();
  });

  it('shows the placeholder and none of the masked values', () => {
    const { container } = render(
      <Card
        profile={profileOf({
          address: '***',
          phone: '***',
          email: '***',
          github: null,
          _maskedFields: ['address', 'phone', 'email', 'github'],
        })}
        maskedText={MASKED_TEXT}
      />,
    );
    expect(screen.getAllByText(MASKED_TEXT)).toHaveLength(4);
    expect(container).not.toHaveTextContent('***');
    expect(screen.queryByRole('link', { name: /mailto|tel:/ })).toBeNull();
    expect(screen.getByRole('link', { name: /linkedin/ })).toBeInTheDocument();
  });

  it('leaves a masked value out, never raw, when there is no masked text', () => {
    const { container } = render(
      <Card profile={profileOf({ phone: '***', _maskedFields: ['phone'] })} />,
    );
    expect(container).not.toHaveTextContent('***');
    expect(screen.queryByRole('link', { name: /\+84/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'mai@example.com' })).toBeInTheDocument();
  });

  it('shows no initials without a name and an avatar', () => {
    render(<Card profile={profileOf({ name: null })} />);
    expect(screen.queryByText('MT')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mai@example.com' })).toBeInTheDocument();
  });

  it('does not link a value that is not a safe target', () => {
    render(
      <Card
        profile={profileOf({
          linkedin: 'javascript:alert(1)',
          email: 'not an email',
        })}
      />,
    );
    expect(screen.queryByRole('link', { name: /javascript/ })).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.getByText('not an email')).toBeInTheDocument();
  });

  it('renders nothing without a contact or without any value', () => {
    const { container, rerender } = render(<Card profile={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <Card
        profile={profileOf({
          address: null,
          phone: '',
          email: null,
          linkedin: null,
          github: null,
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
