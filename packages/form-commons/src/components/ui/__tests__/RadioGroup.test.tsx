import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InputOption } from '../../../lib/inputContract';
import { RadioGroup, RadioGroupItem, type RadioGroupProps } from '../radio-group';

const OPTIONS: InputOption[] = [
  { value: 'a.png', label: 'a.png' },
  { value: 'b.png', label: 'b.png' },
  { value: 'c.png', label: 'c.png' },
];

type GroupProps = Omit<RadioGroupProps, 'config' | 'children'>;

/** Items from `config.options`. */
const FromOptions = (props: GroupProps) => (
  <RadioGroup aria-label="Media" {...props} config={{ options: OPTIONS }} />
);

/** Items from `RadioGroupItem` children. */
const FromItems = (props: GroupProps) => (
  <RadioGroup aria-label="Media" {...props}>
    {OPTIONS.map((option) => (
      <RadioGroupItem key={option.value} value={option.value} aria-label={option.label} />
    ))}
  </RadioGroup>
);

/** A parent that owns the value, as every caller of a controlled input must. */
const stateful = (Group: React.FC<GroupProps>) => {
  const Stateful = ({ initial = null }: { initial?: string | null }) => {
    const [value, setValue] = useState<string | null>(initial);
    return <Group value={value} onChange={setValue} />;
  };
  return Stateful;
};

describe.each([
  ['config.options', FromOptions],
  ['RadioGroupItem children', FromItems],
])('RadioGroup with items from %s', (_source, Group) => {
  const Stateful = stateful(Group);

  it('renders a named radiogroup of radios named by their labels, checked from value', () => {
    render(<Group value="b.png" onChange={() => {}} />);

    expect(screen.getByRole('radiogroup', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'b.png' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'false');
  });

  it('checks nothing while value is null', () => {
    render(<Group value={null} onChange={() => {}} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('calls onChange once with the value on click, never an event', async () => {
    const onChange = vi.fn<(value: string | null) => void>();
    render(<Group value={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'c.png' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('c.png');
  });

  it('is controlled: the selection does not change unless the parent updates value', async () => {
    const onChange = vi.fn();
    render(<Group value="a.png" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: 'c.png' }));

    expect(onChange).toHaveBeenCalledWith('c.png');
    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'c.png' })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves focus and selection with the arrow keys and reports each value', async () => {
    render(<Stateful initial="a.png" />);

    screen.getByRole('radio', { name: 'a.png' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    const b = screen.getByRole('radio', { name: 'b.png' });
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowUp}');

    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'true');
  });

  it('is one Tab stop, and onBlur fires only when focus leaves the group', async () => {
    const onBlur = vi.fn();
    render(
      <>
        <button type="button">Before</button>
        <Group value="b.png" onChange={() => {}} onBlur={onBlur} />
        <button type="button">After</button>
      </>,
    );

    screen.getByRole('button', { name: 'Before' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'b.png' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onBlur).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks on a disabled group', async () => {
    const onChange = vi.fn();
    render(<Group value={null} onChange={onChange} disabled />);

    await userEvent.click(screen.getByRole('radio', { name: 'a.png' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'a.png' })).toHaveAttribute('aria-checked', 'false');
  });

  it('ignores clicks on a read-only group', async () => {
    const onChange = vi.fn();
    render(<Group value="a.png" onChange={onChange} readOnly />);

    await userEvent.click(screen.getByRole('radio', { name: 'b.png' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RadioGroup', () => {
  it('labels each config option with a clickable Label', async () => {
    const onChange = vi.fn();
    render(<FromOptions value={null} onChange={onChange} />);

    await userEvent.click(screen.getByText('b.png'));

    expect(onChange).toHaveBeenCalledWith('b.png');
  });

  it('lays out vertically by default and in a row for config.orientation "horizontal"', () => {
    const { rerender } = render(
      <RadioGroup aria-label="Size" value={null} onChange={() => {}} config={{ options: OPTIONS }} />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Size' });
    expect(group).toHaveClass('grid', 'gap-3');
    expect(group).not.toHaveAttribute('aria-orientation');

    rerender(
      <RadioGroup
        aria-label="Size"
        value={null}
        onChange={() => {}}
        config={{ options: OPTIONS, orientation: 'horizontal' }}
      />,
    );

    expect(group).toHaveAttribute('aria-orientation', 'horizontal');
    expect(group).toHaveClass('flex', 'flex-wrap');
    expect(group).not.toHaveClass('grid');
  });

  it('pairs the primary fill with a primary-ink border and widens the hit area to 44px', () => {
    render(<FromOptions value={null} onChange={() => {}} />);

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
    const groupRef = createRef<HTMLElement>();
    const itemRef = createRef<HTMLElement>();
    render(
      <RadioGroup ref={groupRef} aria-label="Size" value={null} onChange={() => {}}>
        <RadioGroupItem ref={itemRef} value="s" aria-label="Small" />
      </RadioGroup>,
    );

    expect(groupRef.current).toBe(screen.getByRole('radiogroup', { name: 'Size' }));
    expect(itemRef.current).toBe(screen.getByRole('radio', { name: 'Small' }));
  });

  it('types its props on the contract: items from exactly one source, no defaultValue', () => {
    const onChange: RadioGroupProps['onChange'] = (value) => {
      const typed: string | null = value;
      return typed;
    };
    const item = <RadioGroupItem value="s" aria-label="Small" />;
    render(
      <>
        <RadioGroup aria-label="A" value={null} onChange={onChange} config={{ options: OPTIONS }} />
        <RadioGroup aria-label="B" value={null} onChange={onChange} config={{ orientation: 'horizontal' }}>
          {item}
        </RadioGroup>
        {/* @ts-expect-error items from both config.options and children */}
        <RadioGroup aria-label="C" value={null} onChange={onChange} config={{ options: OPTIONS }}>
          {item}
        </RadioGroup>
        {/* @ts-expect-error items from neither config.options nor children */}
        <RadioGroup aria-label="D" value={null} onChange={onChange} />
        {/* @ts-expect-error a config without options needs children */}
        <RadioGroup aria-label="E" value={null} onChange={onChange} config={{}} />
        {/* @ts-expect-error value is required */}
        <RadioGroup aria-label="F" onChange={onChange} config={{ options: OPTIONS }} />
        <RadioGroup
          aria-label="G"
          value={null}
          onChange={onChange}
          config={{ options: OPTIONS }}
          // @ts-expect-error defaultValue is not part of the contract
          defaultValue="a.png"
        />
        <RadioGroup
          aria-label="H"
          value={null}
          onChange={onChange}
          config={{ options: OPTIONS }}
          // @ts-expect-error onValueChange is replaced by onChange
          onValueChange={() => {}}
        />
      </>,
    );

    expect(screen.getAllByRole('radiogroup')).toHaveLength(8);
  });
});
