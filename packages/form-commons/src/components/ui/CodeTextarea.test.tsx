import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { CodeTextarea } from './CodeTextarea';

function gutter(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-slot="code-textarea-numbers"]')!;
}

describe('CodeTextarea', () => {
  it('shows one number per text line from the initial value', () => {
    const { container } = render(
      <CodeTextarea aria-label="Json" defaultValue={'{\n  "a": 1\n}'} />,
    );
    expect(gutter(container).children).toHaveLength(3);
    expect(gutter(container)).toHaveTextContent('123');
  });

  it('follows the text while typing', async () => {
    const { container } = render(<CodeTextarea aria-label="Json" />);
    expect(gutter(container).children).toHaveLength(1);
    await userEvent.type(screen.getByLabelText('Json'), 'a{Enter}b{Enter}c{Enter}');
    expect(gutter(container).children).toHaveLength(4);
  });

  it('hides the gutter from assistive tech and keeps it out of the textarea value', () => {
    const { container } = render(<CodeTextarea aria-label="Json" defaultValue={'a\nb'} />);
    expect(container.querySelector('[data-slot="code-textarea-gutter"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByLabelText('Json')).toHaveValue('a\nb');
  });

  it('turns wrapping off and calls the caller handlers', () => {
    const onChange = vi.fn<() => void>();
    render(<CodeTextarea aria-label="Json" onChange={onChange} />);
    const textarea = screen.getByLabelText('Json');
    expect(textarea).toHaveAttribute('wrap', 'off');
    fireEvent.change(textarea, { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('keeps the gutter scrolled with the textarea', () => {
    const { container } = render(<CodeTextarea aria-label="Json" defaultValue={'a\nb\nc'} />);
    const textarea = screen.getByLabelText('Json');
    textarea.scrollTop = 24;
    fireEvent.scroll(textarea);
    expect(gutter(container).scrollTop).toBe(textarea.scrollTop);
  });

  it('passes a ref to the textarea', () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<CodeTextarea aria-label="Json" ref={ref} />);
    expect(ref.current).toBe(screen.getByLabelText('Json'));
  });

  it('resyncs the numbers when the value is set without an event (form reset)', () => {
    const { container } = render(<CodeTextarea aria-label="Json" defaultValue="a" />);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Json');
    expect(gutter(container).children).toHaveLength(1);
    act(() => {
      textarea.value = 'a\nb\nc\nd';
    });
    expect(gutter(container).children).toHaveLength(4);
    act(() => {
      textarea.value = '';
    });
    expect(gutter(container).children).toHaveLength(1);
  });

  it('resyncs inside a react-hook-form reset', async () => {
    function Harness() {
      const form = useForm({ defaultValues: { j: 'a' } });
      return (
        <>
          <CodeTextarea aria-label="Json" {...form.register('j')} />
          <button type="button" onClick={() => form.reset({ j: '1\n2\n3' })}>
            Reset
          </button>
        </>
      );
    }
    const { container } = render(<Harness />);
    expect(gutter(container).children).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(gutter(container).children).toHaveLength(3);
  });
});
