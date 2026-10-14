import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { LINK_ERROR } from '../../lib/richtext';
import RichTextEditor, { type RichTextEditorHandle } from './RichTextEditor';

// ProseMirror reads the element under a point when it maps the selection; jsdom has no layout.
beforeAll(() => {
  document.elementFromPoint ??= () => null;
});

interface HarnessProps {
  initial: string;
  readOnly?: boolean;
  onChange?: (html: string) => void;
  onRoundTripLoss?: (html: string) => void;
  handle?: React.Ref<RichTextEditorHandle>;
}

/** The editor under a label, with its value in state and a button that sets one from outside. */
const Harness: React.FC<HarnessProps> = ({
  initial,
  readOnly = false,
  onChange,
  onRoundTripLoss = () => {},
  handle,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="body-label">Body</span>
      <RichTextEditor
        ref={handle}
        id="body"
        labelId="body-label"
        value={value}
        onChange={(html) => {
          setValue(html);
          onChange?.(html);
        }}
        onBlur={() => {}}
        onRoundTripLoss={onRoundTripLoss}
        readOnly={readOnly}
      />
      <output aria-label="Value">{value}</output>
      <button type="button" onClick={() => setValue('<p>Reset</p>')}>
        Reset
      </button>
    </>
  );
};

function setup(props: HarnessProps) {
  render(<Harness {...props} />);
  return userEvent.setup();
}

const editor = () => screen.getByRole('textbox', { name: 'Body' });
const toolbar = () => screen.getByRole('toolbar', { name: 'Body formatting' });
const value = () => screen.getByRole('status', { name: 'Value' });

/** Clicks into the editor and selects all of its text. */
async function selectAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(editor());
  await user.keyboard('{Control>}a{/Control}');
}

describe('RichTextEditor (D1)', () => {
  it('is a multiline textbox named by its label, showing the HTML', () => {
    setup({ initial: '<h2>Heading</h2><p>Some <strong>bold</strong> text</p>' });

    const box = editor();
    expect(box).toHaveAttribute('id', 'body');
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(within(box).getByRole('heading', { level: 2, name: 'Heading' })).toBeInTheDocument();
    expect(box.querySelector('strong')).toHaveTextContent('bold');
  });

  it('has a toolbar with one tab stop that the arrow keys, Home and End move', async () => {
    const user = setup({ initial: '<p>x</p>' });
    const buttons = within(toolbar()).getAllByRole('button');

    expect(buttons.map((button) => button.getAttribute('tabindex'))).toEqual([
      '0',
      ...buttons.slice(1).map(() => '-1'),
    ]);
    buttons[0]!.focus();

    await user.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
  });

  it('applies a mark from the toolbar, shows it pressed and reports the HTML', async () => {
    const onChange = vi.fn();
    const user = setup({ initial: '<p>Hello</p>', onChange });
    const bold = within(toolbar()).getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');

    await selectAll(user);
    await user.click(bold);

    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Hello</strong></p>');
  });

  it.each([
    ['Italic', '<p><em>Hello</em></p>'],
    ['Strikethrough', '<p><s>Hello</s></p>'],
    ['Inline code', '<p><code>Hello</code></p>'],
  ])('applies %s to the selection', async (label, html) => {
    const user = setup({ initial: '<p>Hello</p>' });

    await selectAll(user);
    await user.click(within(toolbar()).getByRole('button', { name: label }));

    await waitFor(() => expect(value()).toHaveTextContent(html));
  });

  it.each([
    ['Heading 2', '<h2>Hello</h2>'],
    ['Heading 3', '<h3>Hello</h3>'],
    ['Heading 4', '<h4>Hello</h4>'],
    ['Bulleted list', '<ul><li><p>Hello</p></li></ul>'],
    ['Numbered list', '<ol><li><p>Hello</p></li></ol>'],
    ['Quote', '<blockquote><p>Hello</p></blockquote>'],
    ['Code block', '<pre><code>Hello</code></pre>'],
  ])('turns the block into %s', async (label, html) => {
    const user = setup({ initial: '<p>Hello</p>' });
    const button = within(toolbar()).getByRole('button', { name: label });

    await user.click(editor());
    await user.click(button);

    await waitFor(() => expect(value()).toHaveTextContent(html));
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the focus in the editor when a toolbar button is pressed with a pointer', () => {
    setup({ initial: '<p>x</p>' });
    const bold = within(toolbar()).getByRole('button', { name: 'Bold' });

    // `fireEvent` returns false when the default (moving focus) was prevented.
    expect(fireEvent.mouseDown(bold)).toBe(false);
  });

  it('rejects a javascript: link with a message, and Cancel closes the panel', async () => {
    const onChange = vi.fn();
    const user = setup({ initial: '<p>Click</p>', onChange });
    await selectAll(user);
    const link = within(toolbar()).getByRole('button', { name: 'Link' });

    await user.click(link);
    expect(link).toHaveAttribute('aria-expanded', 'true');
    const url = screen.getByRole('textbox', { name: 'Link URL' });
    expect(url).toHaveFocus();
    await user.type(url, 'javascript:alert(1){Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent(LINK_ERROR);
    expect(url).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Link URL' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds an https link, and removes it again', async () => {
    const user = setup({ initial: '<p>Click</p>' });
    await selectAll(user);
    const link = within(toolbar()).getByRole('button', { name: 'Link' });

    await user.click(link);
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(value()).toHaveTextContent('<p><a href="https://example.com">Click</a></p>'),
    );
    expect(link).toHaveAttribute('aria-pressed', 'true');

    await user.click(link);
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue('https://example.com');
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(value()).toHaveTextContent('<p>Click</p>'));
  });

  it('removes the link when the URL is cleared and applied', async () => {
    const user = setup({ initial: '<p><a href="https://example.com">Click</a></p>' });
    await selectAll(user);

    await user.click(within(toolbar()).getByRole('button', { name: 'Link' }));
    await user.clear(screen.getByRole('textbox', { name: 'Link URL' }));
    await user.keyboard('{Enter}');

    await waitFor(() => expect(value()).toHaveTextContent('<p>Click</p>'));
  });

  it('inserts the URL as linked text when nothing is selected', async () => {
    const user = setup({ initial: '' });
    await user.click(editor());

    await user.click(within(toolbar()).getByRole('button', { name: 'Link' }));
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'mailto:a@b.co{Enter}');

    await waitFor(() =>
      expect(value()).toHaveTextContent('<p><a href="mailto:a@b.co">mailto:a@b.co</a></p>'),
    );
  });

  it('closes the link panel on Escape without a link', async () => {
    const onChange = vi.fn();
    const user = setup({ initial: '<p>Click</p>', onChange });
    await selectAll(user);

    await user.click(within(toolbar()).getByRole('button', { name: 'Link' }));
    await user.keyboard('https://example.com{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Link URL' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports lost markup once on load, with the HTML it keeps (D2)', async () => {
    const onRoundTripLoss = vi.fn();
    setup({ initial: '<p class="lead">Kept</p><img src="x">', onRoundTripLoss });

    // Tiptap emits `create` after a tick.
    await waitFor(() => expect(onRoundTripLoss).toHaveBeenCalledOnce());
    expect(onRoundTripLoss).toHaveBeenCalledWith('<p>Kept</p>');
  });

  it('reports nothing for HTML that round-trips', async () => {
    const onRoundTripLoss = vi.fn();
    setup({ initial: '<ul><li>One</li></ul><blockquote>Quote</blockquote>', onRoundTripLoss });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRoundTripLoss).not.toHaveBeenCalled();
  });

  it('replaces the content when the value changes from outside', async () => {
    const user = setup({ initial: '<p>Old</p>' });

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(editor()).toHaveTextContent('Reset');
  });

  it('reports an empty editor as an empty string', async () => {
    const onChange = vi.fn();
    const user = setup({ initial: '<p>x</p>', onChange });

    await selectAll(user);
    await user.keyboard('{Backspace}');

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''));
  });

  it('focuses the editor through its handle', async () => {
    const handle = { current: null as RichTextEditorHandle | null };
    setup({ initial: '<p>x</p>', handle });

    handle.current?.focus();

    // Tiptap focuses on the next animation frame.
    await waitFor(() => expect(editor()).toHaveFocus());
  });

  it('is read-only without a toolbar in read-only mode', () => {
    setup({ initial: '<p>Locked</p>', readOnly: true });

    expect(editor()).toHaveAttribute('contenteditable', 'false');
    expect(editor()).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});
