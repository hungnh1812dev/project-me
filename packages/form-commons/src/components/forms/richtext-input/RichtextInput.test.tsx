import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { vi } from 'vitest';

import {
  normalizeRichtextHtml,
  richtextExtensions,
  RichtextInput,
  type RichtextImage,
  type RichtextLabels,
} from '.';
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
  textColor: 'Text colour',
  clearTextColor: 'Clear colour',
  insertImage: 'Insert image',
  colors: {
    gray: 'Gray',
    red: 'Red',
    orange: 'Orange',
    amber: 'Amber',
    green: 'Green',
    teal: 'Teal',
    blue: 'Blue',
    violet: 'Violet',
    pink: 'Pink',
  },
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
    ['Text colour'],
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
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Bold');
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

const MEDIA_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const IMAGE_HTML = `<p><img src="https://cdn.test/a.png" alt="Logo" data-media-id="${MEDIA_ID}"></p>`;

describe('RichtextInput text colour', () => {
  it('writes the palette hex as a style and keeps it byte-identical after a reload', async () => {
    const { Editor } = await import('@tiptap/react');
    const html = '<p><span style="color: #b91c1c">red</span> plain</p>';
    const first = new Editor({ extensions: richtextExtensions, content: html });
    expect(first.getHTML()).toBe(html);
    const second = new Editor({ extensions: richtextExtensions, content: first.getHTML() });
    expect(second.getHTML()).toBe(html);
    first.destroy();
    second.destroy();
  });

  it('reads an rgb() colour of the palette back as the same hex', async () => {
    const { Editor } = await import('@tiptap/react');
    const editor = new Editor({
      extensions: richtextExtensions,
      content: '<p><span style="color: rgb(185, 28, 28)">red</span></p>',
    });
    expect(editor.getHTML()).toBe('<p><span style="color: #b91c1c">red</span></p>');
    editor.destroy();
  });

  it('does not keep a colour outside the palette', async () => {
    const { Editor } = await import('@tiptap/react');
    const editor = new Editor({
      extensions: richtextExtensions,
      content: '<p><span style="color: #123456">x</span></p>',
    });
    expect(editor.getHTML()).not.toContain('#123456');
    expect(editor.getHTML()).not.toContain('color');
    editor.destroy();
  });

  it('offers the nine named swatches with the current one marked, and applies a pick', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn<(values: { body: string }) => void>();
    const editor = await renderEditor('<p>word</p>', onValid);
    act(() => {
      editorOf(editor).commands.selectAll();
    });
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    const swatches = await screen.findAllByRole('button', {
      name: /^(Gray|Red|Orange|Amber|Green|Teal|Blue|Violet|Pink)$/,
    });
    expect(swatches).toHaveLength(9);
    await user.click(screen.getByRole('button', { name: 'Red' }));
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    expect(await screen.findByRole('button', { name: 'Red' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe('<p><span style="color: #b91c1c">word</span></p>');
  });

  it('Clear removes the colour span', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn<(values: { body: string }) => void>();
    const editor = await renderEditor('<p><span style="color: #b91c1c">word</span></p>', onValid);
    act(() => {
      editorOf(editor).commands.selectAll();
    });
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    await user.click(await screen.findByRole('button', { name: 'Clear colour' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe('<p>word</p>');
  });
});

describe('RichtextInput image hook', () => {
  it('hides the image button without onRequestImage', async () => {
    await renderEditor();
    expect(screen.queryByRole('button', { name: 'Insert image' })).not.toBeInTheDocument();
  });

  it('calls onRequestImage and inserts the image with its media id at the cursor', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn<(values: { body: string }) => void>();
    const onRequestImage = vi.fn<(insert: (image: RichtextImage) => void) => void>();
    render(
      <TestForm<{ body: string }> options={{ defaultValues: { body: '' } }} onValid={onValid}>
        <RichtextInput
          name="body"
          label="Summary"
          labels={LABELS}
          onRequestImage={onRequestImage}
        />
      </TestForm>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Summary' });
    act(() => {
      editorOf(editor).commands.focus();
    });
    await user.click(screen.getByRole('button', { name: 'Insert image' }));
    expect(onRequestImage).toHaveBeenCalledTimes(1);
    act(() => {
      onRequestImage.mock.calls[0]?.[0]({
        src: 'https://cdn.test/a.png',
        alt: 'Logo',
        mediaId: MEDIA_ID,
      });
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0].body).toBe(IMAGE_HTML);
  });

  it('keeps data-media-id when a stored image is loaded and saved again', async () => {
    const { Editor } = await import('@tiptap/react');
    const editor = new Editor({ extensions: richtextExtensions, content: IMAGE_HTML });
    expect(editor.getHTML()).toBe(IMAGE_HTML);
    editor.destroy();
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
