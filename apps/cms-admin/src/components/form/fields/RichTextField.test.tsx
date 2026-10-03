import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { LINK_ERROR, ROUND_TRIP_WARNING } from '@/features/content/richtext';
import type { DocumentData, FieldDefinition } from '@/features/content/types';

import { SchemaForm } from '../SchemaForm';

// ProseMirror measures the selection to scroll it into view; jsdom has no layout.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const rects = Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= () => rects;
  Range.prototype.getBoundingClientRect ??= () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  document.elementFromPoint ??= () => null;
});

const FIELDS: FieldDefinition[] = [
  { name: 'title', type: 'text' },
  { name: 'body', type: 'richtext' },
];

function renderForm(document: DocumentData | null, readOnly = false) {
  const onSubmit = vi.fn(async (data: DocumentData) => data);
  render(
    <>
      <SchemaForm
        id="doc-form"
        fields={FIELDS}
        document={document}
        onSubmit={onSubmit}
        readOnly={readOnly}
      />
      <button type="submit" form="doc-form">
        Save
      </button>
    </>,
  );
  return { onSubmit, user: userEvent.setup() };
}

const editor = () => screen.findByRole('textbox', { name: 'Body' });
const toolbar = () => screen.findByRole('toolbar', { name: 'Body formatting' });
const savedBody = (onSubmit: ReturnType<typeof vi.fn>) =>
  (onSubmit.mock.calls.at(-1)?.[0] as DocumentData | undefined)?.body;

describe('RichTextField (AC-11, AC-12)', () => {
  it('loads the editor lazily, labelled by the field name, with the saved HTML', async () => {
    renderForm({ title: 'T', body: '<h2>Heading</h2><p>Some <strong>bold</strong> text</p>' });

    const box = await editor();
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(within(box).getByRole('heading', { level: 2, name: 'Heading' })).toBeInTheDocument();
    expect(box.querySelector('strong')).toHaveTextContent('bold');
  });

  it('sends the HTML back unchanged when nothing was edited', async () => {
    const { onSubmit, user } = renderForm({ body: '<p>Hello <em>world</em></p>' });
    await editor();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(savedBody(onSubmit)).toBe('<p>Hello <em>world</em></p>'));
  });

  it('has a toolbar with one tab stop that the arrow keys, Home and End move', async () => {
    const { user } = renderForm({ body: '<p>x</p>' });
    const bar = await toolbar();
    const buttons = within(bar).getAllByRole('button');

    expect(buttons.map((button) => button.getAttribute('tabindex'))).toEqual([
      '0',
      ...buttons.slice(1).map(() => '-1'),
    ]);
    buttons[0]!.focus();

    await user.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    expect(buttons[1]).toHaveAttribute('tabindex', '0');
    expect(buttons[0]).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{End}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
  });

  it('applies a mark from the toolbar, shows it pressed and saves the HTML', async () => {
    const { onSubmit, user } = renderForm({ body: '<p>Hello</p>' });
    const box = await editor();
    const bold = within(await toolbar()).getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');

    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(bold);

    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedBody(onSubmit)).toBe('<p><strong>Hello</strong></p>'));
  });

  it('keeps the focus in the editor when a toolbar button is pressed with a pointer', async () => {
    renderForm({ body: '<p>x</p>' });
    const bold = within(await toolbar()).getByRole('button', { name: 'Bold' });

    // `fireEvent` returns false when the default (moving focus) was prevented.
    expect(fireEvent.mouseDown(bold)).toBe(false);
  });

  it('turns the selection into a heading and back', async () => {
    const { onSubmit, user } = renderForm({ body: '<p>Title</p>' });
    const box = await editor();
    const heading = within(await toolbar()).getByRole('button', { name: 'Heading 2' });

    await user.click(box);
    await user.click(heading);
    await waitFor(() => expect(heading).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedBody(onSubmit)).toBe('<h2>Title</h2>'));
  });

  it('rejects a javascript: link with a message and adds no link', async () => {
    const { onSubmit, user } = renderForm({ body: '<p>Click</p>' });
    const box = await editor();
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');

    await user.click(within(await toolbar()).getByRole('button', { name: 'Link' }));
    const url = screen.getByRole('textbox', { name: 'Link URL' });
    await user.type(url, 'javascript:alert(1){Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent(LINK_ERROR);
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Link URL' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedBody(onSubmit)).toBe('<p>Click</p>'));
  });

  it('adds an https link, and removes it again', async () => {
    const { onSubmit, user } = renderForm({ body: '<p>Click</p>' });
    const box = await editor();
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    const link = within(await toolbar()).getByRole('button', { name: 'Link' });

    await user.click(link);
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByRole('textbox', { name: 'Link URL' })).not.toBeInTheDocument();
    await waitFor(() => expect(link).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(savedBody(onSubmit)).toBe('<p><a href="https://example.com">Click</a></p>'),
    );

    await user.click(link);
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue('https://example.com');
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedBody(onSubmit)).toBe('<p>Click</p>'));
  });

  it('shows the D2 warning for markup the editor drops, and saving removes it', async () => {
    const { onSubmit, user } = renderForm({
      body: '<p class="lead">Kept text</p><script>window.__x = 1</script><img src="x">',
    });
    await editor();

    expect(await screen.findByText(ROUND_TRIP_WARNING)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedBody(onSubmit)).toBe('<p>Kept text</p>'));
    await waitFor(() => expect(screen.queryByText(ROUND_TRIP_WARNING)).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Body' })).not.toHaveAttribute('aria-describedby');
  });

  it('describes the editor with the warning', async () => {
    renderForm({ body: '<p style="color: red">Red</p>' });
    const warning = await screen.findByText(ROUND_TRIP_WARNING);

    expect(await editor()).toHaveAttribute('aria-describedby', warning.id);
  });

  it('shows no warning for HTML that round-trips', async () => {
    renderForm({ body: '<ul><li>One</li></ul><blockquote>Quote</blockquote>' });
    await editor();

    expect(screen.queryByText(ROUND_TRIP_WARNING)).not.toBeInTheDocument();
  });

  it('saves an empty string for an empty editor', async () => {
    const { onSubmit, user } = renderForm(null);
    await editor();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedBody(onSubmit)).toBe(''));
  });

  it('is read-only without a toolbar in read-only mode', async () => {
    renderForm({ body: '<p>Locked</p>' }, true);

    const box = await editor();
    expect(box).toHaveAttribute('contenteditable', 'false');
    expect(box).toHaveAttribute('aria-readonly', 'true');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});
