import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AuthLayout from './AuthLayout';

describe('<AuthLayout>', () => {
  it('renders the only main landmark with the product mark and the page title (AC-41)', () => {
    render(
      <AuthLayout title="Sign in">
        <p>Form goes here</p>
      </AuthLayout>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('hungnhdev CMS');
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Form goes here')).toBeInTheDocument();
  });

  it('is a card at most 400px wide that fills the width below 640px', () => {
    render(<AuthLayout title="Sign in">body</AuthLayout>);

    const card = screen.getByRole('main').querySelector('[data-slot="card"]');
    expect(card).toHaveClass('w-full', 'max-w-[400px]', 'max-sm:rounded-none');
  });

  it('shows the optional description and footer', () => {
    render(
      <AuthLayout
        title="Verify your email"
        description="Enter the code."
        footer={<a href="/login">Back</a>}
      >
        body
      </AuthLayout>,
    );

    expect(screen.getByText('Enter the code.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
  });

  it('leaves the description and footer out when they are not given', () => {
    const { container } = render(<AuthLayout title="Sign in">body</AuthLayout>);

    expect(container.querySelector('[data-slot="card-description"]')).toBeNull();
    expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
  });

  it('leaves the card body out when there is no content, so no empty gap shows', () => {
    const { container } = render(<AuthLayout title="Access denied">{null}</AuthLayout>);

    expect(container.querySelector('[data-slot="card-content"]')).toBeNull();
  });
});
