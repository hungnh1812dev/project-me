import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Editor } from '@tiptap/react';

import { TestForm } from '../test-form';
import {
  normalizeRichtextHtml,
  RichtextInput,
  richtextExtensions,
  type RichtextLabels,
} from './RichtextInput';

const LABELS: RichtextLabels = {
  toolbar: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  code: 'Code',
  heading: 'Heading',
  bulletList: 'Bullet list',
  orderedList: 'Numbered list',
  blockquote: 'Quote',
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
const editorOf = (element: HTMLElement) =>
  (element as HTMLElement & { editor: Editor }).editor;

describe('normalizeRichtextHtml', () => {
  it('maps the empty document to blank', () => {
    expect(normalizeRichtextHtml('<p></p>')).toBe('');
    expect(normalizeRichtextHtml('<p>x</p>')).toBe('<p>x</p>');
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

  it('toggles bold from the toolbar', async () => {
    const onValid = vi.fn<(values: { body: string }) => void>();
    render(
      <TestForm<{ body: string }>
        options={{ defaultValues: { body: '' } }}
        onValid={onValid}
      >
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
    expect(onValid.mock.calls[0]?.[0].body).toBe(
      '<p><strong>Strong</strong></p>',
    );
  });

  it('keeps an untouched empty value blank', async () => {
    const onValid = vi.fn<(values: { body: string }) => void>();
    render(
      <TestForm<{ body: string }>
        options={{ defaultValues: { body: '' } }}
        onValid={onValid}
      >
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
      <TestForm<{ body: string }>
        options={{ defaultValues: { body: '<p>Locked</p>' } }}
      >
        <RichtextInput name="body" label="Summary" labels={LABELS} disabled />
      </TestForm>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Summary' });
    await waitFor(() =>
      expect(editor).toHaveAttribute('contenteditable', 'false'),
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
  });

  it('only produces tags the server allowlist keeps', async () => {
    const { Editor } = await import('@tiptap/react');
    const editor = new Editor({
      extensions: richtextExtensions,
      content:
        '<h2>T</h2><p><strong>b</strong><em>i</em><u>u</u><s>s</s><code>c</code><a href="https://x.test">l</a></p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>q</p></blockquote><pre><code>p</code></pre><hr><p>a<br>b</p>',
    });
    const tags = [...editor.getHTML().matchAll(/<([a-z0-9]+)[\s>/]/g)].map(
      (m) => m[1],
    );
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
