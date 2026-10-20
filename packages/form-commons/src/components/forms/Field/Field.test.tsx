import { render, screen } from '@testing-library/react';

import { Input } from '@/components/ui/input';

import { Field } from './Field';

describe('Field', () => {
  it('links the label to the control', () => {
    render(<Field label="Email">{(control) => <Input {...control} />}</Field>);
    const input = screen.getByLabelText('Email');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('uses a given id', () => {
    render(
      <Field id="email" label="Email">
        {(control) => <Input {...control} />}
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email');
  });

  it('describes the control with its description', () => {
    render(
      <Field id="email" label="Email" description="We send the invite here.">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-describedby', 'email-description');
    expect(input).toHaveAccessibleDescription('We send the invite here.');
  });

  it('marks the control invalid and describes it with description then error', () => {
    render(
      <Field
        id="email"
        label="Email"
        description="We send the invite here."
        error="Enter an email like name@example.com."
      >
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'email-description email-error',
    );
    expect(input).toHaveAccessibleDescription(
      'We send the invite here. Enter an email like name@example.com.',
    );
  });

  it('treats an empty error string as no error', () => {
    render(
      <Field label="Email" error="">
        {(control) => <Input {...control} />}
      </Field>,
    );
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a decorative required marker and sets aria-required', () => {
    render(
      <Field label="Email" required>
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toBeRequired();
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });
});
