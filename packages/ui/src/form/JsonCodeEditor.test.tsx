import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { editorViewOf } from '../lib/jsonEditorView';
import JsonCodeEditor, { type JsonCodeEditorHandle } from './JsonCodeEditor';

const hostOf = (container: HTMLElement): HTMLElement => {
  const host = container.querySelector<HTMLElement>('repo-json-editor');
  if (!host) throw new Error('no <repo-json-editor> host');
  return host;
};

const contentOf = (container: HTMLElement): HTMLElement => {
  const content = hostOf(container).shadowRoot?.querySelector<HTMLElement>('.cm-content');
  if (!content) throw new Error('no .cm-content in the shadow root');
  return content;
};

describe('JsonCodeEditor', () => {
  it('mounts the CodeMirror editor inside an open shadow root on <repo-json-editor>', () => {
    const { container } = render(<JsonCodeEditor value={'{"a":1}'} label="Metadata" />);

    const host = hostOf(container);
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.querySelector('.cm-editor')).not.toBeNull();
    expect(host.shadowRoot?.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(contentOf(container).textContent).toBe('{"a":1}');
  });

  it('defines a form-associated custom element once', () => {
    render(<JsonCodeEditor label="One" />);
    render(<JsonCodeEditor label="Two" />);

    const ctor = customElements.get('repo-json-editor') as
      (CustomElementConstructor & { formAssociated?: boolean }) | undefined;
    expect(ctor?.formAssociated).toBe(true);
  });

  it('adds no <style> element to document (AC-29)', () => {
    const before = document.querySelectorAll('style').length;
    render(<JsonCodeEditor value="[]" label="Metadata" />);

    expect(document.querySelectorAll('style').length).toBe(before);
  });

  it('labels the in-shadow textbox (AC-20)', () => {
    const { container } = render(
      <JsonCodeEditor label="Metadata" required invalid description="Any JSON" error="Bad" />,
    );

    const content = contentOf(container);
    expect(content).toHaveAttribute('role', 'textbox');
    expect(content).toHaveAttribute('aria-multiline', 'true');
    expect(content).toHaveAttribute('aria-label', 'Metadata');
    expect(content).toHaveAttribute('aria-required', 'true');
    expect(content).toHaveAttribute('aria-invalid', 'true');

    const describedBy = content.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = hostOf(container).shadowRoot?.getElementById(describedBy ?? '');
    expect(description?.textContent).toBe('Any JSON Bad');
  });

  it('updates the content attributes when props change', () => {
    const { container, rerender } = render(<JsonCodeEditor label="Metadata" />);
    expect(contentOf(container)).not.toHaveAttribute('aria-invalid');

    rerender(<JsonCodeEditor label="Settings" invalid error="Invalid JSON" />);

    expect(contentOf(container)).toHaveAttribute('aria-label', 'Settings');
    expect(contentOf(container)).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks a read-only editor aria-readonly and blocks edits (AC-19)', () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<JsonCodeEditor ref={ref} readOnly value="{}" label="M" />);

    expect(contentOf(container)).toHaveAttribute('aria-readonly', 'true');
    expect(ref.current?.view?.state.readOnly).toBe(true);
  });

  it('makes a disabled editor non-editable (AC-19)', () => {
    const { container } = render(<JsonCodeEditor disabled value="{}" label="M" />);

    expect(contentOf(container)).toHaveAttribute('contenteditable', 'false');
    expect(contentOf(container)).toHaveAttribute('aria-disabled', 'true');
    expect(hostOf(container)).toHaveAttribute('data-disabled');
  });

  it('calls onChange with the full text on edits', () => {
    const onChange = vi.fn();
    const ref = createRef<JsonCodeEditorHandle>();
    render(<JsonCodeEditor ref={ref} defaultValue="{}" onChange={onChange} label="M" />);

    act(() => {
      ref.current?.view?.dispatch({ changes: { from: 1, insert: '"a":1' } });
    });

    expect(onChange).toHaveBeenCalledWith('{"a":1}');
  });

  it('pushes outside value changes into the editor', () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const onChange = vi.fn();
    const { rerender } = render(
      <JsonCodeEditor ref={ref} value="{}" onChange={onChange} label="M" />,
    );

    rerender(<JsonCodeEditor ref={ref} value="[1]" onChange={onChange} label="M" />);

    expect(ref.current?.view?.state.doc.toString()).toBe('[1]');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('focuses the editor content through the ref and reports blur', () => {
    const onBlur = vi.fn();
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<JsonCodeEditor ref={ref} onBlur={onBlur} label="M" />);

    act(() => ref.current?.focus());
    expect(hostOf(container).shadowRoot?.activeElement).toBe(contentOf(container));

    act(() => {
      contentOf(container).dispatchEvent(new FocusEvent('blur'));
    });
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('passes id, name and className to the host', () => {
    const { container } = render(
      <JsonCodeEditor id="meta" name="metadata" className="extra" label="M" />,
    );

    const host = hostOf(container);
    expect(host).toHaveAttribute('id', 'meta');
    expect(host).toHaveAttribute('name', 'metadata');
    expect(host).toHaveClass('extra', 'border-input');
  });

  it('destroys the view on unmount', () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const { unmount } = render(<JsonCodeEditor ref={ref} label="M" />);
    const view = ref.current?.view;
    const destroy = vi.spyOn(view!, 'destroy');

    unmount();

    expect(destroy).toHaveBeenCalled();
  });

  it('finds the view from the host element, or null without one', () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<JsonCodeEditor ref={ref} label="M" />);

    expect(editorViewOf(hostOf(container))).toBe(ref.current?.view);
    expect(editorViewOf(document.createElement('div'))).toBeNull();
  });
});
