import * as React from 'react';
import { cn } from 'cn';

import { CONTROL_FOCUS_WITHIN_CLASSES } from '@/components/ui/Control.constants';
import { Textarea } from '@/components/ui/Textarea';

const watchedTextareas = new WeakSet<HTMLTextAreaElement>();

/** Calls `onValueSet` whenever code sets `.value` (a form reset sets it without any event). */
function watchValueWrites(textarea: HTMLTextAreaElement, onValueSet: (text: string) => void) {
  if (watchedTextareas.has(textarea)) return;
  watchedTextareas.add(textarea);
  // React's input tracker may already own `value` on the node; wrap whichever descriptor is active.
  const descriptor =
    Object.getOwnPropertyDescriptor(textarea, 'value') ??
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  if (!descriptor?.get || !descriptor.set) return;
  const readValue = descriptor.get.bind(textarea) as () => string;
  const writeValue = descriptor.set.bind(textarea) as (next: string) => void;
  Object.defineProperty(textarea, 'value', {
    configurable: true,
    get() {
      return readValue();
    },
    set(next: string) {
      writeValue(next);
      onValueSet(readValue());
    },
  });
}

function countLines(text: string): number {
  return text.split('\n').length;
}

/**
 * A `Textarea` on a dark code surface with a line-number gutter. Lines never
 * wrap (it scrolls sideways), so one number matches one text line.
 */
function CodeTextarea({
  className,
  ref,
  onChange,
  onInput,
  onScroll,
  onFocus,
  ...props
}: React.ComponentProps<'textarea'>) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const [lineCount, setLineCount] = React.useState(1);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (node) watchValueWrites(node, (text) => setLineCount(countLines(text)));
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  React.useEffect(() => {
    const text = typeof props.value === 'string' ? props.value : (textareaRef.current?.value ?? '');
    setLineCount(countLines(text));
  }, [props.value]);

  const syncGutterScroll = (textarea: HTMLTextAreaElement) => {
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
  };

  return (
    <div
      data-slot="code-textarea"
      className={cn(
        'border-input bg-code text-code-foreground rounded-control duration-fast flex min-h-20 w-full min-w-0 overflow-hidden border transition-[color,box-shadow]',
        CONTROL_FOCUS_WITHIN_CLASSES,
        'has-[textarea[aria-invalid=true]]:border-destructive has-[textarea[aria-invalid=true]]:ring-destructive/20',
        'has-[textarea:disabled]:cursor-not-allowed has-[textarea:disabled]:opacity-50',
      )}
    >
      <div
        aria-hidden="true"
        data-slot="code-textarea-gutter"
        className="text-code-muted-foreground relative flex-none font-mono text-sm leading-normal tabular-nums select-none"
      >
        {/* Sizes the column to the widest number without growing it with the line count. */}
        <div className="invisible py-2 pr-2 pl-3 text-right">{lineCount}</div>
        <div
          ref={gutterRef}
          className="absolute inset-0 overflow-hidden py-2 pr-2 pl-3 text-right"
          data-slot="code-textarea-numbers"
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
      </div>
      <Textarea
        {...props}
        ref={setRefs}
        wrap="off"
        onChange={(event) => {
          setLineCount(countLines(event.currentTarget.value));
          onChange?.(event);
        }}
        onInput={(event) => {
          setLineCount(countLines(event.currentTarget.value));
          onInput?.(event);
        }}
        onFocus={(event) => {
          setLineCount(countLines(event.currentTarget.value));
          onFocus?.(event);
        }}
        onScroll={(event) => {
          syncGutterScroll(event.currentTarget);
          onScroll?.(event);
        }}
        className={cn(
          'text-code-foreground selection:bg-primary selection:text-primary-foreground placeholder:text-code-muted-foreground min-h-20 flex-1 resize-y rounded-none border-0 bg-transparent px-2 font-mono text-sm leading-normal whitespace-pre shadow-none focus-visible:ring-0 focus-visible:outline-none md:text-sm',
          className,
        )}
      />
    </div>
  );
}

export { CodeTextarea };
