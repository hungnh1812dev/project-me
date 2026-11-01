import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Code2,
  Italic,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];
type HeadingLabelKey = `heading${HeadingLevel}`;

export type RichtextLabels = {
  toolbar: string;
  undo: string;
  redo: string;
  /** Names the block type menu; its button also shows the current block type. */
  blockType: string;
  paragraph: string;
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  code: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  codeBlock: string;
  horizontalRule: string;
  link: string;
  unlink: string;
  /** Shown by the link prompt. */
  linkPrompt: string;
} & Record<HeadingLabelKey, string>;

export interface RichtextToolbarButton {
  kind: 'button';
  key: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isDisabled: boolean;
  run: () => void;
}

export interface RichtextToolbarMenuItem {
  key: string;
  label: string;
  isActive: boolean;
  run: () => void;
}

export interface RichtextToolbarMenu {
  kind: 'menu';
  key: string;
  label: string;
  currentLabel: string;
  items: RichtextToolbarMenuItem[];
}

export type RichtextToolbarControl = RichtextToolbarButton | RichtextToolbarMenu;

export interface RichtextToolbarGroup {
  key: string;
  controls: RichtextToolbarControl[];
}

type Chain = ReturnType<Editor['chain']>;
type ChainCommand = (chain: ReturnType<Chain['focus']>) => ReturnType<Chain['focus']>;

const ALIGNMENTS = [
  { value: 'left', labelKey: 'alignLeft', icon: AlignLeft },
  { value: 'center', labelKey: 'alignCenter', icon: AlignCenter },
  { value: 'right', labelKey: 'alignRight', icon: AlignRight },
  { value: 'justify', labelKey: 'alignJustify', icon: AlignJustify },
] as const;

interface MarkDefinition {
  key: 'bold' | 'italic' | 'underline' | 'strike' | 'code';
  icon: LucideIcon;
  toggle: ChainCommand;
}

const MARKS: readonly MarkDefinition[] = [
  { key: 'bold', icon: Bold, toggle: (chain) => chain.toggleBold() },
  { key: 'italic', icon: Italic, toggle: (chain) => chain.toggleItalic() },
  { key: 'underline', icon: Underline, toggle: (chain) => chain.toggleUnderline() },
  { key: 'strike', icon: Strikethrough, toggle: (chain) => chain.toggleStrike() },
  { key: 'code', icon: Code, toggle: (chain) => chain.toggleCode() },
];

interface BlockDefinition {
  key: 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock';
  icon: LucideIcon;
  toggle: ChainCommand;
}

const BLOCKS: readonly BlockDefinition[] = [
  { key: 'bulletList', icon: List, toggle: (chain) => chain.toggleBulletList() },
  { key: 'orderedList', icon: ListOrdered, toggle: (chain) => chain.toggleOrderedList() },
  { key: 'blockquote', icon: Quote, toggle: (chain) => chain.toggleBlockquote() },
  { key: 'codeBlock', icon: Code2, toggle: (chain) => chain.toggleCodeBlock() },
];

function toggleButton(
  editor: Editor,
  labels: RichtextLabels,
  { key, icon, toggle }: MarkDefinition | BlockDefinition,
): RichtextToolbarButton {
  return {
    kind: 'button',
    key,
    label: labels[key],
    icon,
    isActive: editor.isActive(key),
    isDisabled: false,
    run: () => void toggle(editor.chain().focus()).run(),
  };
}

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

function buildBlockTypeMenu(editor: Editor, labels: RichtextLabels): RichtextToolbarMenu {
  const paragraph: RichtextToolbarMenuItem = {
    key: 'paragraph',
    label: labels.paragraph,
    isActive: editor.isActive('paragraph'),
    run: () => void editor.chain().focus().setParagraph().run(),
  };
  const headings = HEADING_LEVELS.map((level): RichtextToolbarMenuItem => ({
    key: `heading${level}`,
    label: labels[`heading${level}`],
    isActive: editor.isActive('heading', { level }),
    run: () => void editor.chain().focus().setHeading({ level }).run(),
  }));
  const items = [paragraph, ...headings];
  return {
    kind: 'menu',
    key: 'blockType',
    label: labels.blockType,
    currentLabel: (items.find((item) => item.isActive) ?? paragraph).label,
    items,
  };
}

function buildAlignmentButtons(editor: Editor, labels: RichtextLabels): RichtextToolbarButton[] {
  const canAlign = editor.isActive('paragraph') || editor.isActive('heading');
  return ALIGNMENTS.map(({ value, labelKey, icon }) => ({
    kind: 'button',
    key: labelKey,
    label: labels[labelKey],
    icon,
    isActive: editor.isActive({ textAlign: value }),
    isDisabled: !canAlign,
    run: () => void editor.chain().focus().setTextAlign(value).run(),
  }));
}

/** One entry per control; a new control is one more entry in its group. */
export function buildRichtextToolbar(
  editor: Editor,
  labels: RichtextLabels,
): RichtextToolbarGroup[] {
  return [
    {
      key: 'history',
      controls: [
        {
          kind: 'button',
          key: 'undo',
          label: labels.undo,
          icon: Undo2,
          isActive: false,
          isDisabled: !editor.can().undo(),
          run: () => void editor.chain().focus().undo().run(),
        },
        {
          kind: 'button',
          key: 'redo',
          label: labels.redo,
          icon: Redo2,
          isActive: false,
          isDisabled: !editor.can().redo(),
          run: () => void editor.chain().focus().redo().run(),
        },
      ],
    },
    { key: 'blockType', controls: [buildBlockTypeMenu(editor, labels)] },
    { key: 'marks', controls: MARKS.map((mark) => toggleButton(editor, labels, mark)) },
    { key: 'alignment', controls: buildAlignmentButtons(editor, labels) },
    {
      key: 'blocks',
      controls: [
        ...BLOCKS.map((block) => toggleButton(editor, labels, block)),
        {
          kind: 'button',
          key: 'horizontalRule',
          label: labels.horizontalRule,
          icon: Minus,
          isActive: false,
          isDisabled: false,
          run: () => void editor.chain().focus().setHorizontalRule().run(),
        },
      ],
    },
    {
      key: 'link',
      controls: [
        {
          kind: 'button',
          key: 'link',
          label: labels.link,
          icon: Link,
          isActive: editor.isActive('link'),
          isDisabled: false,
          run: () => promptForLink(editor, labels),
        },
        {
          kind: 'button',
          key: 'unlink',
          label: labels.unlink,
          icon: Link2Off,
          isActive: false,
          isDisabled: !editor.isActive('link'),
          run: () => void editor.chain().focus().extendMarkRange('link').unsetLink().run(),
        },
      ],
    },
  ];
}
