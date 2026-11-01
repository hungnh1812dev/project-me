import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { cn } from 'cn';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { Toolbar } from 'radix-ui';
import {
  useController,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';

import { Field } from '@/components/forms/field';
import { useRequiredFormContext } from '@/components/forms/FieldWiring.setup';
import { Button } from '@/components/ui/Button';
import {
  CONTROL_FOCUS_WITHIN_CLASSES,
  CONTROL_INVALID_CLASSES,
} from '@/components/ui/Control.constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { IconButton } from '@/components/ui/IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

import { normalizeRichtextHtml, readCspNonce, richtextExtensions } from './Richtext.setup';
import { RICHTEXT_CONTENT_CLASS } from './Richtext.styles';
import type { RichtextToolbarColors } from './RichtextTextColor';
import {
  buildRichtextToolbar,
  type RichtextImage,
  type RichtextLabels,
  type RichtextToolbarControl,
  type RichtextToolbarOptions,
} from './RichtextToolbar';

export type { RichtextImage, RichtextLabels };

export interface RichtextInputProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label: string;
  labels: RichtextLabels;
  description?: React.ReactNode | undefined;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  required?: boolean;
  disabled?: boolean;
  id?: string | undefined;
  fieldClassName?: string | undefined;
  /** Shows the image button; call `insert` with a File Library image to add it at the cursor. */
  onRequestImage?: RichtextToolbarOptions['onRequestImage'];
}

function ColorControl({
  control,
  disabled,
}: {
  control: RichtextToolbarColors;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const choose = (run: () => void) => {
    run();
    setIsOpen(false);
  };
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Toolbar.Button asChild disabled={disabled}>
          <IconButton type="button" variant="ghost" label={control.label} className="size-8">
            <Palette
              aria-hidden
              style={control.currentHex ? { color: control.currentHex } : undefined}
            />
          </IconButton>
        </Toolbar.Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto" aria-label={control.label}>
        <div className="grid grid-cols-5 gap-1">
          {control.swatches.map((swatch) => (
            <button
              key={swatch.key}
              type="button"
              aria-label={swatch.label}
              aria-pressed={swatch.isActive}
              title={swatch.label}
              onClick={() => choose(swatch.run)}
              style={{ backgroundColor: swatch.hex ?? undefined }}
              className="text-primary-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-md border border-black/10 outline-none focus-visible:ring-2"
            >
              {swatch.isActive && <Check aria-hidden className="size-4" />}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => choose(control.clear.run)}
        >
          {control.clear.label}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarControl({
  control,
  disabled,
}: {
  control: RichtextToolbarControl;
  disabled: boolean;
}) {
  if (control.kind === 'colors') return <ColorControl control={control} disabled={disabled} />;
  if (control.kind === 'button') {
    const Icon = control.icon;
    return (
      <Toolbar.Button asChild disabled={disabled}>
        <IconButton
          type="button"
          variant="ghost"
          label={control.label}
          aria-pressed={control.isActive}
          aria-disabled={control.isDisabled || undefined}
          className={cn(
            'size-8 aria-disabled:cursor-default aria-disabled:opacity-50',
            control.isActive && 'bg-accent',
          )}
          onClick={control.isDisabled ? undefined : control.run}
        >
          <Icon aria-hidden />
        </IconButton>
      </Toolbar.Button>
    );
  }
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Toolbar.Button asChild disabled={disabled}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`${control.label}: ${control.currentLabel}`}
                disabled={disabled}
              >
                {control.currentLabel}
                <ChevronDown aria-hidden />
              </Button>
            </Toolbar.Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{control.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {control.items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            aria-current={item.isActive || undefined}
            className={cn(item.isActive && 'bg-accent')}
            onSelect={item.run}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  onRequestImage,
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
    onUpdate: ({ editor: current }) => onChange(normalizeRichtextHtml(current.getHTML())),
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
            'border-input bg-card rounded-md border',
            CONTROL_FOCUS_WITHIN_CLASSES,
            CONTROL_INVALID_CLASSES,
            disabled && 'opacity-50',
          )}
        >
          {editor && (
            <Toolbar.Root
              aria-label={labels.toolbar}
              className="border-input flex flex-wrap items-center gap-1 border-b p-1"
            >
              {buildRichtextToolbar(editor, labels, { onRequestImage }).map((group, index) => (
                <React.Fragment key={group.key}>
                  {index > 0 && <Toolbar.Separator className="bg-border mx-1 h-5 w-px" />}
                  {group.controls.map((item) => (
                    <ToolbarControl key={item.key} control={item} disabled={disabled} />
                  ))}
                </React.Fragment>
              ))}
            </Toolbar.Root>
          )}
          <EditorContent editor={editor} id={control.id} className={RICHTEXT_CONTENT_CLASS} />
        </div>
      )}
    </Field>
  );
}

export { RichtextInput };
