import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from '@repo/ui/components/input';

import { Field } from './Field';

describe('Field', () => {
  it('links a visible label to the control with a generated id', () => {
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText('Name');
    expect(input.id).not.toBe('');
    expect(screen.getByText('Name')).toBeVisible();
  });

  it('uses the id it is given', () => {
    render(
      <Field label="Email" id="email">
        <Input type="email" />
      </Field>,
    );

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email');
  });

  it('uses the id already set on the control', () => {
    render(
      <Field label="Email">
        <Input id="own-id" />
      </Field>,
    );

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'own-id');
  });

  it('describes the control with the description text', () => {
    render(
      <Field label="Slug" description="Lowercase letters and dashes.">
        <Input />
      </Field>,
    );

    expect(screen.getByLabelText('Slug')).toHaveAccessibleDescription(
      'Lowercase letters and dashes.',
    );
    expect(screen.getByLabelText('Slug')).not.toHaveAttribute('aria-invalid');
  });

  it('shows the error as an alert, describes the control with it and marks it invalid', () => {
    render(
      <Field label="Slug" description="Lowercase only." error="Slug is taken.">
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText('Slug');
    expect(screen.getByRole('alert')).toHaveTextContent('Slug is taken.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Lowercase only. Slug is taken.');
  });

  it('keeps an aria-describedby the control already has', () => {
    render(
      <>
        <p id="extra">Extra hint</p>
        <Field label="Title" error="Required.">
          <Input aria-describedby="extra" />
        </Field>
      </>,
    );

    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Extra hint Required.');
  });

  it('marks a required field visibly and sets required and aria-required', () => {
    render(
      <Field label="Title" required>
        <Input />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('Title')).toHaveAttribute('data-required', 'true');
    expect(screen.getByText('Title')).toHaveClass("after:content-['*'_/_'']");
  });

  it('can hide the label visually and keep the accessible name', () => {
    render(
      <Field label="Search" hideLabel>
        <Input type="search" />
      </Field>,
    );

    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByText('Search')).toHaveClass('sr-only');
  });
});
