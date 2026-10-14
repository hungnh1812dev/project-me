import { lazy, Suspense, useId, useRef, useState } from 'react';

import type {
  RichTextEditorHandle,
  RichTextEditorProps,
} from '../../components/forms/RichTextEditor';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import { ROUND_TRIP_WARNING } from '../../lib/richtext';
import { Section } from './Section';

// Lazy, as cms-admin's RichTextField loads it: Tiptap stays in its own chunk.
const RichTextEditor = lazy(() => import('../../components/forms/RichTextEditor'));

export interface RichTextDemoProps extends Partial<
  Pick<RichTextEditorProps, 'onBlur' | 'onRoundTripLoss' | 'readOnly'>
> {
  label: string;
  value: string;
  onChange: (html: string) => void;
}

const noop = () => {};

/**
 * A labelled RichTextEditor, wired as cms-admin's RichTextField wires it: the label names and
 * focuses the editor, a skeleton holds its place while the chunk loads, and lost markup shows the
 * round-trip warning.
 */
export const RichTextDemo: React.FC<RichTextDemoProps> = ({
  label,
  value,
  onChange,
  onBlur = noop,
  onRoundTripLoss,
  readOnly = false,
}) => {
  const id = useId();
  const labelId = `${id}-label`;
  const warningId = `${id}-warning`;
  const [lossy, setLossy] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={labelId} onClick={() => editorRef.current?.focus()}>
        {label}
      </Label>
      <Suspense
        fallback={<Skeleton data-slot="rich-text-skeleton" aria-hidden className="h-40 w-full" />}
      >
        <RichTextEditor
          ref={editorRef}
          id={`${id}-editor`}
          labelId={labelId}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onRoundTripLoss={(html) => {
            setLossy(true);
            onRoundTripLoss?.(html);
          }}
          readOnly={readOnly}
          aria-describedby={lossy ? warningId : undefined}
        />
      </Suspense>
      {lossy && (
        <p id={warningId} className="text-muted-foreground text-sm">
          {ROUND_TRIP_WARNING}
        </p>
      )}
    </div>
  );
};
RichTextDemo.displayName = 'RichTextDemo';

const ARTICLE =
  '<h2>Release notes</h2><p>Version <strong>2.0</strong> adds <em>scheduled</em> publishing and ' +
  '<code>draft</code> previews. See <a href="https://example.com/docs">the docs</a>.</p>' +
  '<ul><li><p>Faster lists</p></li><li><p>Bulk actions</p></li></ul>' +
  '<blockquote><p>Back up before upgrading.</p></blockquote>';

/**
 * The UI kit's RichTextEditor section: empty, filled with every format, read-only, and HTML the
 * editor can't keep (an underline), which shows the round-trip warning.
 */
export const RichTextEditorSection: React.FC = () => {
  const [body, setBody] = useState('');
  const [article, setArticle] = useState(ARTICLE);
  const [legacy, setLegacy] = useState('<p>An <u>underlined</u> word.</p>');

  return (
    <Section title="RichTextEditor">
      <RichTextDemo label="Body" value={body} onChange={setBody} />
      <RichTextDemo label="Article" value={article} onChange={setArticle} />
      <RichTextDemo label="Read-only article" value={ARTICLE} onChange={noop} readOnly />
      <RichTextDemo label="Legacy content" value={legacy} onChange={setLegacy} />
    </Section>
  );
};
RichTextEditorSection.displayName = 'RichTextEditorSection';
