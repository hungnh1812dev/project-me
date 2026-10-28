import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useController,
} from 'react-hook-form';
import { cn } from 'cn';

import { Field } from '@/components/forms/field';
import { useRequiredFormContext } from '@/components/forms/FieldWiring.setup';
import {
  CONTROL_FOCUS_WITHIN_CLASSES,
  CONTROL_INVALID_CLASSES,
} from '@/components/ui/Control.constants';
import { Button } from '@/components/ui/Button';

import {
  normalizeRichtextHtml,
  readCspNonce,
  richtextExtensions,
} from './Richtext.setup';
import { RICHTEXT_CONTENT_CLASS } from './Richtext.styles';
import { buildRichtextToolbar, type RichtextLabels } from './RichtextToolbar';

export type { RichtextLabels };

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
              {buildRichtextToolbar(editor, labels).map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-pressed={action.isActive}
                  className={cn(action.isActive && 'bg-accent')}
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
            className={RICHTEXT_CONTENT_CLASS}
          />
        </div>
      )}
    </Field>
  );
}

export { RichtextInput };
