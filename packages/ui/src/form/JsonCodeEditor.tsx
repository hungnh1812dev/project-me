'use client';

import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';

import { cn } from '../lib/cn';
import {
  disabledThemeSpec,
  editorSizeSpec,
  editorThemeSpec,
  highlightSpec,
  needsExternalSync,
} from '../lib/jsonEditor';

const TAG = 'repo-json-editor';
const DESCRIPTION_ID = 'json-editor-description';
/** Marks transactions that sync an outside `value` in, so they don't echo back to `onChange`. */
const external = Annotation.define<boolean>();

declare module 'react' {
  // oxlint-disable-next-line typescript/no-namespace -- JSX intrinsic elements are declared this way.
  namespace JSX {
    interface IntrinsicElements {
      [TAG]: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        name?: string;
      };
    }
  }
}

/**
 * Defines `<repo-json-editor>` once. It is form-associated (so a `<label for>` can point at it)
 * and owns an open shadow root with delegated focus. CodeMirror mounted inside resolves that
 * shadow root as its root, so its rules go into an adopted stylesheet there instead of a
 * `<style>` element in `document` (the CSP stays `style-src 'self'`).
 */
const defineHost = (): void => {
  if (typeof customElements === 'undefined' || customElements.get(TAG)) return;
  customElements.define(
    TAG,
    class extends HTMLElement {
      static formAssociated = true;

      constructor() {
        super();
        this.attachShadow({ mode: 'open', delegatesFocus: true });
        if (typeof this.attachInternals === 'function') this.attachInternals();
      }
    },
  );
};

export interface JsonCodeEditorHandle {
  /** Moves focus into the editor content. */
  focus: () => void;
  /** The CodeMirror view, once mounted. */
  readonly view: EditorView | null;
}

export interface JsonCodeEditorProps {
  /** The JSON text (controlled). */
  value?: string;
  /** The initial JSON text (uncontrolled). */
  defaultValue?: string;
  onChange?: (text: string) => void;
  onBlur?: () => void;
  /** The accessible name of the in-shadow textbox. */
  label?: string;
  /** Field description, mirrored into the in-shadow describedby node. */
  description?: string;
  /** Current error text, mirrored into the in-shadow describedby node. */
  error?: string | null;
  invalid?: boolean;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  /** Minimum height in lines. */
  rows?: number;
  id?: string;
  name?: string;
  className?: string;
  ref?: React.Ref<JsonCodeEditorHandle>;
}

type AttributeProps = Pick<
  JsonCodeEditorProps,
  'label' | 'invalid' | 'required' | 'readOnly' | 'disabled'
>;

const contentAttributes = ({ label, invalid, required, readOnly, disabled }: AttributeProps) => {
  const attributes: Record<string, string> = {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-describedby': DESCRIPTION_ID,
  };
  if (label) attributes['aria-label'] = label;
  if (invalid) attributes['aria-invalid'] = 'true';
  if (required) attributes['aria-required'] = 'true';
  if (readOnly) attributes['aria-readonly'] = 'true';
  if (disabled) attributes['aria-disabled'] = 'true';
  return attributes;
};

const stateExtensions = (props: AttributeProps): Extension[] => [
  EditorView.contentAttributes.of(contentAttributes(props)),
  EditorState.readOnly.of(Boolean(props.readOnly || props.disabled)),
  EditorView.editable.of(!props.disabled),
  props.disabled ? EditorView.theme(disabledThemeSpec) : [],
];

const hideVisually = (node: HTMLElement): void => {
  // CSSOM writes are not governed by `style-src`.
  Object.assign(node.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  });
};

/** CodeMirror 6 JSON editor in a shadow root. Loaded lazily by `JsonInput`. */
const JsonCodeEditor: React.FC<JsonCodeEditorProps> = ({
  value,
  defaultValue = '',
  onChange,
  onBlur,
  label,
  description,
  error,
  invalid,
  required,
  readOnly,
  disabled,
  rows = 6,
  id,
  name,
  className,
  ref,
}) => {
  defineHost();
  const hostRef = useRef<HTMLElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const stateCompartment = useRef(new Compartment());
  const callbacks = useRef({ onChange, onBlur });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onBlur };
  });
  // Mount-time values; later changes go through the effects below.
  const attributesRef = useRef<AttributeProps>({ label, invalid, required, readOnly, disabled });
  const initialText = useRef(value ?? defaultValue);
  const rowsRef = useRef(rows);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    get view() {
      return viewRef.current;
    },
  }));

  useEffect(() => {
    const shadow = hostRef.current?.shadowRoot;
    if (!shadow) return;
    const parent = document.createElement('div');
    const describedBy = document.createElement('div');
    describedBy.id = DESCRIPTION_ID;
    hideVisually(describedBy);
    shadow.append(parent, describedBy);
    descriptionRef.current = describedBy;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialText.current,
        extensions: [
          json(),
          lineNumbers(),
          bracketMatching(),
          closeBrackets(),
          history(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.theme(editorThemeSpec),
          EditorView.theme(editorSizeSpec(rowsRef.current)),
          syntaxHighlighting(HighlightStyle.define([...highlightSpec])),
          stateCompartment.current.of(stateExtensions(attributesRef.current)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external)))
              callbacks.current.onChange?.(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({ blur: () => void callbacks.current.onBlur?.() }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      parent.remove();
      describedBy.remove();
      viewRef.current = null;
      descriptionRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: stateCompartment.current.reconfigure(
        stateExtensions({ label, invalid, required, readOnly, disabled }),
      ),
    });
  }, [label, invalid, required, readOnly, disabled]);

  useEffect(() => {
    if (descriptionRef.current)
      descriptionRef.current.textContent = [description, error].filter(Boolean).join(' ');
  }, [description, error]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !needsExternalSync(view.state.doc.toString(), value)) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      // Its own undo step, so later typing never merges into it (AC-22).
      annotations: [external.of(true), isolateHistory.of('full')],
    });
  }, [value]);

  return (
    <repo-json-editor
      ref={hostRef}
      id={id}
      name={name}
      data-slot="json-code-editor"
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        'border-input focus-within:outline-ring data-invalid:border-destructive block w-full overflow-hidden rounded-md border focus-within:outline-2 focus-within:outline-offset-2 data-disabled:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-70',
        className,
      )}
    />
  );
};
JsonCodeEditor.displayName = 'JsonCodeEditor';

export default JsonCodeEditor;
