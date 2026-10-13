import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RadioGroup, RadioGroupItem } from '../../components/radio-group';

const Files = (props: React.ComponentProps<typeof RadioGroup>) => (
  <RadioGroup aria-label="Media" {...props}>
    <RadioGroupItem value="a.png" aria-label="a.png" />
    <RadioGroupItem value="b.png" aria-label="b.png" />
    <RadioGroupItem value="c.png" aria-label="c.png" />
  </RadioGroup>
);

describe('RadioGroup', () => {
  it('renders a named radiogroup of radios named by their labels', () => {
    render(<Files defaultValue="b.png" />);

    expect(screen.getByRole('radiogroup', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'b.png' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'false');
  });

  it('selects an item on click and reports the value', async () => {
    const onValueChange = vi.fn();
    render(<Files onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'c.png' }));

    expect(onValueChange).toHaveBeenCalledWith('c.png', expect.anything());
    expect(screen.getByRole('radio', { name: 'c.png' })).toHaveAttribute('aria-checked', 'true');
  });

  it('moves focus and selection with the arrow keys', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('a.png');
      return <Files value={value} onValueChange={(next) => setValue(next as string)} />;
    };
    render(<Controlled />);

    screen.getByRole('radio', { name: 'a.png' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    const b = screen.getByRole('radio', { name: 'b.png' });
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowUp}');

    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'true');
  });

  it('is one Tab stop', async () => {
    render(
      <>
        <button type="button">Before</button>
        <Files defaultValue="b.png" />
        <button type="button">After</button>
      </>,
    );

    screen.getByRole('button', { name: 'Before' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'b.png' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('ignores clicks on a disabled group', async () => {
    render(<Files disabled />);

    await userEvent.click(screen.getByRole('radio', { name: 'a.png' }));

    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'false');
  });

  it('pairs the primary fill with a primary-ink border and widens the hit area to 44px', () => {
    render(<Files />);

    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveClass(
      'data-checked:bg-primary',
      'data-checked:border-primary-ink',
      'relative',
      'size-4',
      'after:absolute',
      'after:-inset-3.5',
    );
  });

  it('forwards refs to the group and the item', () => {
    const groupRef = createRef<HTMLDivElement>();
    const itemRef = createRef<HTMLElement>();
    render(
      <RadioGroup ref={groupRef} aria-label="Size">
        <RadioGroupItem ref={itemRef} value="s" aria-label="Small" />
      </RadioGroup>,
    );

    expect(groupRef.current).toBe(screen.getByRole('radiogroup', { name: 'Size' }));
    expect(itemRef.current).toBe(screen.getByRole('radio', { name: 'Small' }));
  });
});
