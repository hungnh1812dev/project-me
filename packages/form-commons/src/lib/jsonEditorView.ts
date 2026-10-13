import { EditorView } from '@codemirror/view';

/**
 * The CodeMirror view mounted in a `<repo-json-editor>` host, or `null`. For tests and tools
 * that can't reach the editor through its ref. Importing this pulls in `@codemirror/view`, so
 * app code shouldn't (the editor stays in its lazy chunk).
 */
export const editorViewOf = (host: Element): EditorView | null => {
  const editor = host.shadowRoot?.querySelector<HTMLElement>('.cm-editor');
  return editor ? EditorView.findFromDOM(editor) : null;
};
