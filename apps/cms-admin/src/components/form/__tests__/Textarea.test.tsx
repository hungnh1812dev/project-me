import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Textarea } from '@/components/ui/textarea';

import { Field } from '../Field';

describe('Textarea', () => {
  it('defaults to 4 rows with vertical resizing only', () => {
    render(<Textarea aria-label="Notes" />);

    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    expect(textarea).toHaveAttribute('rows', '4');
    expect(textarea).toHaveClass('resize-y');
  });

  it('forwards ref and passes native props through', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="Notes" rows={8} placeholder="Write here" />);

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Notes' }));
    expect(ref.current).toHaveAttribute('rows', '8');
    expect(ref.current).toHaveAttribute('placeholder', 'Write here');
  });

  it('shows no counter without maxLength', () => {
    render(<Textarea aria-label="Notes" />);

    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it('shows a live "n / max" count linked through aria-describedby', async () => {
    render(
      <Field label="Bio" description="A short bio.">
        <Textarea maxLength={10} />
      </Field>,
    );
    const textarea = screen.getByLabelText('Bio');

    expect(textarea).toHaveAccessibleDescription('A short bio. 0 / 10');

    await userEvent.type(textarea, 'abc');

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(textarea).toHaveAccessibleDescription('A short bio. 3 / 10');
  });

  it('turns the count to the warning colour at 90% and announces it only at the limit', async () => {
    render(<Textarea aria-label="Bio" maxLength={10} defaultValue="12345678" />);
    const count = screen.getByText('8 / 10');
    expect(count).not.toHaveClass('text-warning');
    expect(count).toHaveAttribute('aria-live', 'off');

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), '9');

    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');
    expect(screen.getByText('9 / 10')).toHaveAttribute('aria-live', 'off');

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), '0');

    expect(screen.getByText('10 / 10')).toHaveAttribute('aria-live', 'polite');
  });

  it('counts a controlled value', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('hi');
      return (
        <Textarea
          aria-label="Bio"
          maxLength={20}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    };
    render(<Controlled />);
    expect(screen.getByText('2 / 20')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), '!');

    expect(screen.getByText('3 / 20')).toBeInTheDocument();
  });

  it('ignores typing while disabled', async () => {
    render(<Textarea aria-label="Bio" disabled />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), 'abc');

    expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveValue('');
  });
});
