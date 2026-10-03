import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  SquareCodeIcon,
  StrikethroughIcon,
} from 'lucide-react';

import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/cn';

import { Field } from '@/components/form/Field';
import { Input } from '@/components/ui/input';
import { changesOnRoundTrip, isAllowedHref, LINK_ERROR } from '@/features/content/richtext';

/** What a parent can do with the editor: focus it (react-hook-form focuses a field this way). */
export interface RichTextEditorHandle {
  focus: () => void;
}

export interface RichTextEditorProps {
  /** The id of the editable element. */
  id: string;
  /** The id of the visible label that names the editor (and its toolbar). */
  labelId: string;
  /** The HTML value. An empty editor is `''`. */
  value: string;
  onChange: (html: string) => void;
  onBlur: () => void;
  /**
   * Called once the loaded HTML has been read, with the editor's serialisation, when the two
   * differ in more than formatting-neutral ways (D2): some markup will be lost on save.
   */
  onRoundTripLoss: (html: string) => void;
  readOnly: boolean;
  'aria-describedby'?: string;
  ref?: React.Ref<RichTextEditorHandle>;
}

/**
 * The D1 node set: paragraph, h2 to h4, bold, italic, strike, inline code, code block, bullet and
 * ordered lists, blockquote and links (http, https and mailto only). No images, no raw HTML, no
 * hard break, rule or underline, and no extension that adds content on its own (trailing node).
 */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: false,
    underline: false,
    horizontalRule: false,
    hardBreak: false,
    dropcursor: false,
    trailingNode: false,
  }),
  Link.configure({
    openOnClick: false,
    // No attributes of its own, so a link round-trips as the server sent it.
    HTMLAttributes: { target: null, rel: null, class: null },
    isAllowedUri: (url) => isAllowedHref(url),
  }),
];

/** The editor's HTML, with an empty document as `''`. */
const htmlOf = (editor: Editor) => (editor.isEmpty ? '' : editor.getHTML());

interface ToolbarItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const icon = (Icon: React.ComponentType<{ 'aria-hidden'?: boolean }>) => <Icon aria-hidden />;

const ITEMS: readonly ToolbarItem[] = [
  {
    key: 'bold',
    label: 'Bold',
    icon: icon(BoldIcon),
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    label: 'Italic',
    icon: icon(ItalicIcon),
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: 'strike',
    label: 'Strikethrough',
    icon: icon(StrikethroughIcon),
    isActive: (e) => e.isActive('strike'),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    key: 'code',
    label: 'Inline code',
    icon: icon(CodeIcon),
    isActive: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  ...([2, 3, 4] as const).map<ToolbarItem>((level) => ({
    key: `h${level}`,
    label: `Heading ${level}`,
    icon: icon([Heading2Icon, Heading3Icon, Heading4Icon][level - 2]!),
    isActive: (e) => e.isActive('heading', { level }),
    run: (e) => e.chain().focus().toggleHeading({ level }).run(),
  })),
  {
    key: 'bulletList',
    label: 'Bulleted list',
    icon: icon(ListIcon),
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    label: 'Numbered list',
    icon: icon(ListOrderedIcon),
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'blockquote',
    label: 'Quote',
    icon: icon(QuoteIcon),
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'codeBlock',
    label: 'Code block',
    icon: icon(SquareCodeIcon),
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

const LINK_KEY = 'link';

interface LinkPanelProps {
  editor: Editor;
  onClose: () => void;
}

/**
 * Edits the link of the selection. Not a `<form>`: it sits inside the schema form, so Enter is
 * handled here and never submits the entry. A URL that isn't http, https or mailto is refused.
 */
const LinkPanel: React.FC<LinkPanelProps> = ({ editor, onClose }) => {
  const current = editor.getAttributes('link').href;
  const [href, setHref] = useState(typeof current === 'string' ? current : '');
  const [error, setError] = useState<string | undefined>();
  const active = editor.isActive('link');

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  const apply = () => {
    const value = href.trim();
    if (value === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    if (!isAllowedHref(value)) {
      setError(LINK_ERROR);
      return;
    }
    if (editor.state.selection.empty && !active) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: value,
          marks: [{ type: 'link', attrs: { href: value } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    }
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  };

  return (
    <div className="flex flex-col gap-2 border-b p-2 sm:flex-row sm:items-start">
      <Field label="Link URL" hideLabel error={error} className="min-w-0 flex-1">
        <Input
          type="url"
          inputMode="url"
          placeholder="https://"
          autoFocus
          value={href}
          onChange={(event) => {
            setHref(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={apply}>
          Apply
        </Button>
        {active && (
          <Button type="button" size="sm" variant="outline" onClick={remove}>
            Remove link
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
LinkPanel.displayName = 'LinkPanel';

interface ToolbarProps {
  editor: Editor;
  labelId: string;
  linkOpen: boolean;
  onLink: () => void;
}

/**
 * The formatting toolbar (AC-12): one tab stop, moved with the arrow keys, Home and End (roving
 * tabindex), and `aria-pressed` on every button for the state at the selection.
 */
const Toolbar: React.FC<ToolbarProps> = ({ editor, labelId, linkOpen, onLink }) => {
  const [current, setCurrent] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pressed = useEditorState({
    editor,
    selector: ({ editor: e }): Record<string, boolean> => ({
      ...Object.fromEntries(ITEMS.map((item) => [item.key, item.isActive(e)])),
      [LINK_KEY]: e.isActive('link'),
    }),
  });
  const count = ITEMS.length + 1;

  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = {
      ArrowRight: (current + 1) % count,
      ArrowLeft: (current - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setCurrent(next);
    buttons.current[next]?.focus();
  };

  const button = (
    index: number,
    key: string,
    label: string,
    content: React.ReactNode,
    onClick: () => void,
  ) => (
    <Button
      key={key}
      ref={(element: HTMLButtonElement | null) => {
        buttons.current[index] = element;
      }}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={pressed[key] === true}
      aria-expanded={key === LINK_KEY ? linkOpen : undefined}
      tabIndex={index === current ? 0 : -1}
      onFocus={() => setCurrent(index)}
      // A pointer press keeps the focus (and the selection) in the editor.
      onMouseDown={(event: React.MouseEvent) => event.preventDefault()}
      onClick={onClick}
      className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
    >
      {content}
    </Button>
  );

  return (
    <div
      role="toolbar"
      aria-labelledby={`${labelId} ${labelId}-toolbar`}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-0.5 border-b p-1"
    >
      <span id={`${labelId}-toolbar`} hidden>
        formatting
      </span>
      {ITEMS.map((item, index) =>
        button(index, item.key, item.label, item.icon, () => item.run(editor)),
      )}
      {button(ITEMS.length, LINK_KEY, 'Link', icon(LinkIcon), onLink)}
    </div>
  );
};
Toolbar.displayName = 'Toolbar';

/**
 * The Tiptap richtext editor (D1). It lives in its own lazy chunk: only `RichTextField` imports
 * it, through `React.lazy`. `injectCSS: false` keeps Tiptap from adding a `<style>` element (the
 * CSP has no `'unsafe-inline'`); the editor's styles are the `.rich-text` rules in `globals.css`.
 */
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  id,
  labelId,
  value,
  onChange,
  onBlur,
  onRoundTripLoss,
  readOnly,
  'aria-describedby': describedBy,
  ref,
}) => {
  const [linkOpen, setLinkOpen] = useState(false);
  // The HTML the editor last reported or was given, so an echo of it doesn't reset the content.
  const last = useRef(value);
  const callbacks = useRef({ onChange, onBlur, onRoundTripLoss });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onBlur, onRoundTripLoss };
  });

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value,
    editable: !readOnly,
    injectCSS: false,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        ...(describedBy && { 'aria-describedby': describedBy }),
        ...(readOnly && { 'aria-readonly': 'true' }),
        class: 'rich-text min-h-32 px-3 py-2 text-base outline-none',
      },
    },
    onCreate: ({ editor: created }) => {
      const html = htmlOf(created);
      if (changesOnRoundTrip(last.current, html)) {
        last.current = html;
        callbacks.current.onRoundTripLoss(html);
      }
    },
    onUpdate: ({ editor: updated }) => {
      const html = htmlOf(updated);
      last.current = html;
      callbacks.current.onChange(html);
    },
    onBlur: () => callbacks.current.onBlur(),
  });

  useImperativeHandle(ref, () => ({ focus: () => editor.commands.focus() }), [editor]);

  // A value from outside (a form reset after a save) replaces the content.
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  return (
    <div
      data-slot="rich-text-editor"
      className={cn(
        'overflow-hidden rounded-md border border-input bg-background text-foreground transition-colors',
        'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
        readOnly && 'bg-muted/40',
      )}
    >
      {!readOnly && (
        <Toolbar
          editor={editor}
          labelId={labelId}
          linkOpen={linkOpen}
          onLink={() => setLinkOpen((open) => !open)}
        />
      )}
      {!readOnly && linkOpen && <LinkPanel editor={editor} onClose={() => setLinkOpen(false)} />}
      <EditorContent editor={editor} />
    </div>
  );
};
RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
