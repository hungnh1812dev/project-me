import type { ChainedCommands, Editor } from '@tiptap/react';

export interface RichtextLabels {
  toolbar: string;
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  code: string;
  heading: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  link: string;
  unlink: string;
  /** Shown by the link prompt. */
  linkPrompt: string;
}

export interface RichtextToolbarAction {
  key: string;
  label: string;
  isActive: boolean;
  run: () => void;
}

type ToggleLabelKey = Exclude<
  keyof RichtextLabels,
  'toolbar' | 'link' | 'unlink' | 'linkPrompt'
>;

interface ToggleDefinition {
  key: ToggleLabelKey;
  isActive: (editor: Editor) => boolean;
  toggle: (chain: ChainedCommands) => ChainedCommands;
}

const HEADING_LEVEL = 2;

const TOGGLES: readonly ToggleDefinition[] = [
  {
    key: 'bold',
    isActive: (editor) => editor.isActive('bold'),
    toggle: (chain) => chain.toggleBold(),
  },
  {
    key: 'italic',
    isActive: (editor) => editor.isActive('italic'),
    toggle: (chain) => chain.toggleItalic(),
  },
  {
    key: 'underline',
    isActive: (editor) => editor.isActive('underline'),
    toggle: (chain) => chain.toggleUnderline(),
  },
  {
    key: 'strike',
    isActive: (editor) => editor.isActive('strike'),
    toggle: (chain) => chain.toggleStrike(),
  },
  {
    key: 'code',
    isActive: (editor) => editor.isActive('code'),
    toggle: (chain) => chain.toggleCode(),
  },
  {
    key: 'heading',
    isActive: (editor) => editor.isActive('heading', { level: HEADING_LEVEL }),
    toggle: (chain) => chain.toggleHeading({ level: HEADING_LEVEL }),
  },
  {
    key: 'bulletList',
    isActive: (editor) => editor.isActive('bulletList'),
    toggle: (chain) => chain.toggleBulletList(),
  },
  {
    key: 'orderedList',
    isActive: (editor) => editor.isActive('orderedList'),
    toggle: (chain) => chain.toggleOrderedList(),
  },
  {
    key: 'blockquote',
    isActive: (editor) => editor.isActive('blockquote'),
    toggle: (chain) => chain.toggleBlockquote(),
  },
];

function promptForLink(editor: Editor, labels: RichtextLabels): void {
  const href = window.prompt(labels.linkPrompt);
  if (href === null) return;
  const linkChain = editor.chain().focus().extendMarkRange('link');
  if (href.trim() === '') {
    void linkChain.unsetLink().run();
    return;
  }
  void linkChain.setLink({ href: href.trim() }).run();
}

export function buildRichtextToolbar(
  editor: Editor,
  labels: RichtextLabels,
): RichtextToolbarAction[] {
  const toggleActions = TOGGLES.map(({ key, isActive, toggle }) => ({
    key,
    label: labels[key],
    isActive: isActive(editor),
    run: () => void toggle(editor.chain().focus()).run(),
  }));
  return [
    ...toggleActions,
    {
      key: 'link',
      label: labels.link,
      isActive: editor.isActive('link'),
      run: () => promptForLink(editor, labels),
    },
    {
      key: 'unlink',
      label: labels.unlink,
      isActive: false,
      run: () =>
        void editor.chain().focus().extendMarkRange('link').unsetLink().run(),
    },
  ];
}
