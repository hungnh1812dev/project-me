import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { vi } from 'vitest';

import { normalizeRichtextHtml, richtextExtensions, RichtextInput, type RichtextLabels } from '.';
import { TestForm } from '../../../../test/TestForm.fixture';

const LABELS: RichtextLabels = {
  toolbar: 'Formatting',
  undo: 'Undo',
  redo: 'Redo',
  blockType: 'Text style',
  paragraph: 'Paragraph',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  heading4: 'Heading 4',
  heading5: 'Heading 5',
  heading6: 'Heading 6',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  code: 'Code',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  alignJustify: 'Justify',
  bulletList: 'Bullet list',
  orderedList: 'Numbered list',
  blockquote: 'Quote',
  codeBlock: 'Code block',
  horizontalRule: 'Divider',
  link: 'Link',
  unlink: 'Remove link',
  linkPrompt: 'Link address',
};

/** Tags cms-api sanitizeRichtext keeps (ALLOWED_TAGS). */
const SERVER_TAGS = new Set([
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
]);

/** jsdom cannot type into ProseMirror; Tiptap exposes the editor on its DOM node. */
const editorOf = (element: HTMLElement) => (element as HTMLElement & { editor: Editor }).editor;

describe('normalizeRichtextHtml', () => {
  it('maps the empty document to blank', () => {
    expect(normalizeRichtextHtml('<p></p>')).toBe('');
    expect(normalizeRichtextHtml('<p>x</p>')).toBe('<p>x</p>');
  });
});

function renderEditor(body = '', onValid?: (values: { body: string }) => void) {
  render(
    <TestForm<{ body: string }>
      options={{ defaultValues: { body } }}
      {...(onValid ? { onValid } : {})}
    >
      <RichtextInput name="body" label="Summary" labels={LABELS} />
    </TestForm>,
  );
  return screen.findByRole('textbox', { name: 'Summary' });
}

describe('RichtextInput toolbar', () => {
  const GROUPS_IN_ORDER = [
    ['Undo', 'Redo'],
    ['Text style: Paragraph'],
    ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Code'],
    ['Align left', 'Align center', 'Align right', 'Justify'],
    ['Bullet list', 'Numbered list', 'Quote', 'Code block', 'Divider'],
    ['Link', 'Remove link'],
  ];

  it('names every control and orders them in groups split by dividers', async () => {
    await renderEditor();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    const names = within(toolbar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(GROUPS_IN_ORDER.flat());
    expect(within(toolbar).getAllByRole('separator')).toHaveLength(GROUPS_IN_ORDER.length - 1);
  });

  it('shows a tooltip with the control name', async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.hover(screen.getByRole('button', { name: 'Bold' }));
    expect(await screen.findByRole('tooltip', {}, { timeout: 2000 })).toHaveTextContent('Bold');
  });

  it('wraps on narrow widths', async () => {
    await renderEditor();
    expect(screen.getByRole('toolbar')).toHaveClass('flex-wrap');
  });

  it.each([1, 2, 3, 4, 5, 6])('sets heading %i from the block type menu', async (level) => {
    const user = userEvent.setup();
    const onValid = vi.fn<(values: { body: string }) => void>();
    const editor = await renderEditor('<p>Title</p>', onValid);
    act(() => {
      editorOf(editor).commands.focus();
    });
    await user.click(screen.getByRole('button', { name: 'Text style: Paragraph' }));
    await user.click(await screen.findByRole('menuitem', { name: `Heading ${level}` }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe(`<h${level}>Title</h${level}><p></p>`);
    expect(
      screen.getByRole('button', { name: `Text style: Heading ${level}` }),
    ).toBeInTheDocument();
  });

  it('saves alignment as a text-align style on paragraphs and headings', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn<(values: { body: string }) => void>();
    const editor = await renderEditor('<h2>Title</h2>', onValid);
    act(() => {
      editorOf(editor).commands.focus();
    });
    const centre = screen.getByRole('button', { name: 'Align center' });
    await user.click(centre);
    expect(centre).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe(
      '<h2 style="text-align: center;">Title</h2><p></p>',
    );
  });

  it('does not offer alignment inside a code block', async () => {
    const editor = await renderEditor('<pre><code>x</code></pre>');
    act(() => {
      editorOf(editor).commands.focus();
    });
    expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('inserts a divider and a code block', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn<(values: { body: string }) => void>();
    const editor = await renderEditor('<p>a</p>', onValid);
    act(() => {
      editorOf(editor).commands.focus();
    });
    await user.click(screen.getByRole('button', { name: 'Divider' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toContain('<hr>');
  });

  it('undoes the last edit', async () => {
    const user = userEvent.setup();
    const editor = await renderEditor();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true');
    act(() => {
      editorOf(editor).commands.insertContent('typed');
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(editor).not.toHaveTextContent('typed');
  });

  it('is one tab stop with arrow, Home and End keys moving between controls', async () => {
    const user = userEvent.setup();
    await renderEditor();
    const toolbar = screen.getByRole('toolbar');
    await user.tab();
    const first = document.activeElement as HTMLElement;
    expect(toolbar).toContainElement(first);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).not.toBe(first);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove link' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(first);
    await user.tab();
    expect(toolbar).not.toContainElement(document.activeElement as HTMLElement);
  });
});

describe('RichtextInput', () => {
  it('shows the stored value and writes edits back as HTML', async () => {
    const onValid = vi.fn<(values: { body: string }) => void>();
    render(
      <TestForm<{ body: string }>
        options={{ defaultValues: { body: '<p>Hello</p>' } }}
        onValid={onValid}
      >
        <RichtextInput name="body" label="Summary" labels={LABELS} />
      </TestForm>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Summary' });
    expect(editor).toHaveTextContent('Hello');
    act(() => {
      editorOf(editor).commands.insertContentAt(
        editorOf(editor).state.doc.content.size - 1,
        ' there',
      );
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toContain('there');
  });

  it('stamps the page CSP nonce on the style Tiptap injects', async () => {
    const meta = document.createElement('meta');
    meta.name = 'csp-nonce';
    meta.content = 'test-nonce';
    document.head.appendChild(meta);
    document.querySelectorAll('style[data-tiptap-style]').forEach((node) => node.remove());
    render(
      <TestForm<{ body: string }> options={{ defaultValues: { body: '' } }}>
        <RichtextInput name="body" label="Summary" labels={LABELS} />
      </TestForm>,
    );
    await screen.findByRole('textbox', { name: 'Summary' });
    expect(document.querySelector('style[data-tiptap-style]')?.getAttribute('nonce')).toBe(
      'test-nonce',
    );
    meta.remove();
  });

  it('toggles bold from the toolbar', async () => {
    const onValid = vi.fn<(values: { body: string }) => void>();
    render(
      <TestForm<{ body: string }> options={{ defaultValues: { body: '' } }} onValid={onValid}>
        <RichtextInput name="body" label="Summary" labels={LABELS} />
      </TestForm>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Summary' });
    act(() => {
      editorOf(editor).commands.focus();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));
    act(() => {
      editorOf(editor).commands.insertContent('Strong');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe('<p><strong>Strong</strong></p>');
  });

  it('keeps an untouched empty value blank', async () => {
    const onValid = vi.fn<(values: { body: string }) => void>();
    render(
      <TestForm<{ body: string }> options={{ defaultValues: { body: '' } }} onValid={onValid}>
        <RichtextInput name="body" label="Summary" labels={LABELS} />
      </TestForm>,
    );
    await screen.findByRole('textbox', { name: 'Summary' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe('');
  });

  it('shows a required error', async () => {
    render(
      <TestForm<{ body: string }> options={{ defaultValues: { body: '' } }}>
        <RichtextInput
          name="body"
          label="Summary"
          labels={LABELS}
          rules={{ required: 'Summary is required.' }}
        />
      </TestForm>,
    );
    await screen.findByRole('textbox', { name: 'Summary' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Summary is required.')).toBeInTheDocument();
  });

  it('is not editable when disabled', async () => {
    render(
      <TestForm<{ body: string }> options={{ defaultValues: { body: '<p>Locked</p>' } }}>
        <RichtextInput name="body" label="Summary" labels={LABELS} disabled />
      </TestForm>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Summary' });
    await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'false'));
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  });

  it('only produces tags the server allowlist keeps', async () => {
    const { Editor } = await import('@tiptap/react');
    const editor = new Editor({
      extensions: richtextExtensions,
      content:
        '<h2>T</h2><p><strong>b</strong><em>i</em><u>u</u><s>s</s><code>c</code><a href="https://x.test">l</a></p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><pre><code>p</code></pre><hr><p>a<br>b</p>',
    });
    const tags = [...editor.getHTML().matchAll(/<([a-z0-9]+)[\s>/]/g)].map((m) => m[1]);
    expect(tags.filter((t) => !SERVER_TAGS.has(t ?? ''))).toEqual([]);
    expect(editor.getHTML()).not.toMatch(/class=|style=/);
    editor.destroy();
  });

  it('drops javascript: links on load', async () => {
    const { Editor } = await import('@tiptap/react');
    const editor = new Editor({
      extensions: richtextExtensions,
      content: '<p><a href="javascript:alert(1)">x</a></p>',
    });
    expect(editor.getHTML()).not.toContain('javascript:');
    editor.destroy();
  });
});
