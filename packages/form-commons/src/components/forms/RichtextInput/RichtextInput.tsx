import * as React from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useController,
} from 'react-hook-form';
import { cn } from 'cn';

import { Field } from '@/components/forms/Field';
import { useRequiredFormContext } from '@/components/forms/field-wiring';
import {
  CONTROL_FOCUS_WITHIN_CLASSES,
  CONTROL_INVALID_CLASSES,
} from '@/components/ui/control.constants';
import { Button } from '@/components/ui/button';
import { RICHTEXT_LINK_PROTOCOLS } from '@/constants/richtext.constants';
import { CSP_NONCE_META_NAME } from '@/constants/security.constants';

/**
 * Tiptap injects its base CSS as a <style>; under a nonce-based `style-src` it
 * needs the page's nonce, which the host app publishes in this meta tag.
 */
const CSP_NONCE_META_SELECTOR = `meta[name="${CSP_NONCE_META_NAME}"]`;

function readCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const content = document
    .querySelector(CSP_NONCE_META_SELECTOR)
    ?.getAttribute('content');
  return content || undefined;
}

/** What an empty Tiptap document serializes to. */
const EMPTY_DOC_HTML = '<p></p>';

/**
 * Extensions kept to what cms-api `sanitizeRichtext` allows (T24): paragraphs,
 * line breaks, rules, bold/italic/underline/strike, code, quotes, headings,
 * lists and links. Add a tag here only after adding it to the server list.
 */
export const richtextExtensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: false,
      protocols: RICHTEXT_LINK_PROTOCOLS,
      HTMLAttributes: { class: null, target: null, rel: null },
    },
    codeBlock: { HTMLAttributes: { class: null } },
  }),
];

/** Empty editor content is stored as '' (no value), not '<p></p>'. */
export function normalizeRichtextHtml(html: string): string {
  return html === EMPTY_DOC_HTML ? '' : html;
}

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

export interface RichtextInputProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  name: FieldPath<TFieldValues>;
  label: string;
  labels: RichtextLabels;
  description?: React.ReactNode | undefined;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  required?: boolean;
  disabled?: boolean;
  id?: string | undefined;
  fieldClassName?: string | undefined;
}

interface ToolbarAction {
  key: string;
  label: string;
  active: boolean;
  run: () => void;
}

function toolbarActions(
  editor: Editor,
  labels: RichtextLabels,
): ToolbarAction[] {
  const chain = () => editor.chain().focus();
  return [
    {
      key: 'bold',
      label: labels.bold,
      active: editor.isActive('bold'),
      run: () => void chain().toggleBold().run(),
    },
    {
      key: 'italic',
      label: labels.italic,
      active: editor.isActive('italic'),
      run: () => void chain().toggleItalic().run(),
    },
    {
      key: 'underline',
      label: labels.underline,
      active: editor.isActive('underline'),
      run: () => void chain().toggleUnderline().run(),
    },
    {
      key: 'strike',
      label: labels.strike,
      active: editor.isActive('strike'),
      run: () => void chain().toggleStrike().run(),
    },
    {
      key: 'code',
      label: labels.code,
      active: editor.isActive('code'),
      run: () => void chain().toggleCode().run(),
    },
    {
      key: 'heading',
      label: labels.heading,
      active: editor.isActive('heading', { level: 2 }),
      run: () => void chain().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'bulletList',
      label: labels.bulletList,
      active: editor.isActive('bulletList'),
      run: () => void chain().toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      label: labels.orderedList,
      active: editor.isActive('orderedList'),
      run: () => void chain().toggleOrderedList().run(),
    },
    {
      key: 'blockquote',
      label: labels.blockquote,
      active: editor.isActive('blockquote'),
      run: () => void chain().toggleBlockquote().run(),
    },
    {
      key: 'link',
      label: labels.link,
      active: editor.isActive('link'),
      run: () => {
        const href = window.prompt(labels.linkPrompt);
        if (href === null) return;
        if (href.trim() === '') {
          void chain().extendMarkRange('link').unsetLink().run();
          return;
        }
        void chain()
          .extendMarkRange('link')
          .setLink({ href: href.trim() })
          .run();
      },
    },
    {
      key: 'unlink',
      label: labels.unlink,
      active: false,
      run: () => void chain().extendMarkRange('link').unsetLink().run(),
    },
  ];
}

/**
 * Rich text editor (Tiptap) bound to the surrounding react-hook-form
 * `FormProvider`. The form value is the HTML string; blank means "no value".
 * The server sanitizes again on write.
 */
function RichtextInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label,
  labels,
  description,
  rules,
  required,
  disabled = false,
  id,
  fieldClassName,
}: RichtextInputProps<TFieldValues>) {
  const form = useRequiredFormContext<TFieldValues>();
  const { field, fieldState } = useController({
    name,
    control: form.control,
    ...(rules ? { rules } : {}),
  });
  const isRequired = required ?? Boolean(rules?.required);
  const value = typeof field.value === 'string' ? field.value : '';

  const { onChange, onBlur } = field;
  const editor = useEditor({
    extensions: richtextExtensions,
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    injectNonce: readCspNonce(),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
      },
    },
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) =>
      onChange(normalizeRichtextHtml(current.getHTML())),
    onBlur: () => onBlur(),
  });

  // Reflect outside changes (form reset, loaded document) into the editor.
  React.useEffect(() => {
    if (!editor) return;
    if (normalizeRichtextHtml(editor.getHTML()) !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <Field
      label={label}
      description={description}
      error={fieldState.error?.message}
      required={isRequired}
      className={fieldClassName}
      id={id}
    >
      {(control) => (
        <div
          data-slot="richtext"
          aria-invalid={control['aria-invalid']}
          className={cn(
            'rounded-md border border-input bg-card',
            CONTROL_FOCUS_WITHIN_CLASSES,
            CONTROL_INVALID_CLASSES,
            disabled && 'opacity-50',
          )}
        >
          {editor && (
            <div
              role="toolbar"
              aria-label={labels.toolbar}
              className="flex flex-wrap gap-1 border-b border-input p-1"
            >
              {toolbarActions(editor, labels).map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-pressed={action.active}
                  className={cn(action.active && 'bg-accent')}
                  onClick={action.run}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          <EditorContent
            editor={editor}
            id={control.id}
            className="[&_.tiptap]:min-h-32 [&_.tiptap]:px-3 [&_.tiptap]:py-2 [&_.tiptap]:text-sm [&_.tiptap]:outline-none [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:pl-3 [&_.tiptap_h1]:text-xl [&_.tiptap_h2]:text-lg [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_pre]:font-mono [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5"
          />
        </div>
      )}
    </Field>
  );
}

export { RichtextInput };
