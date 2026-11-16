import { createContext, useContext, type ReactNode } from 'react';

import { isSafeLinkTarget } from '@/utils/SafeLinkTarget.rules';

import { isMaskedField, type CvCommonText, type PageCvA } from './PageCv.graphql';

interface SectionProps {
  cv: PageCvA;
  /** The CV labels; `null` when they could not load, so every title is left out. */
  text: CvCommonText | null;
}

export const MUTED_CLASS = 'text-sm text-muted-foreground';
const LINK_CLASS = 'text-primary underline-offset-4 hover:underline';
const SECTION_TITLE_CLASS = 'text-lg font-semibold tracking-tight';
const RICHTEXT_CLASS =
  'text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5';

/** The text a masked value shows. The CV labels have no field for it yet, so nothing provides it and a masked value is left out. */
export const MaskedTextContext = createContext<string | null>(null);

/** The masked-value text in force, or `null` when a masked value must be left out. */
export function useMaskedText(): string | null {
  return useContext(MaskedTextContext);
}

/** Stands in for a value the visitor's role may not read; renders nothing without masked text. */
export function MaskedPlaceholder() {
  const text = useMaskedText();
  if (text === null) return null;
  return (
    <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-sm italic">
      {text}
    </span>
  );
}

/** A link that opens in a new tab; a target that is not safe renders as text. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (!isSafeLinkTarget(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

/** Richtext that has already been through `sanitizeCvRichtext`. */
export function Richtext({ html }: { html: string }) {
  return <div className={RICHTEXT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The frame of one page section: a rule, the title when there is one, and the content. */
export function CvSection({
  title,
  children,
}: {
  title?: string | null | undefined;
  children: ReactNode;
}) {
  const hasTitle = hasText(title);
  return (
    <section className="border-border mt-10 border-t pt-6">
      {hasTitle ? <h2 className={SECTION_TITLE_CLASS}>{title}</h2> : null}
      <div className={hasTitle ? 'mt-4' : undefined}>{children}</div>
    </section>
  );
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** "Team size: 6", or null when the label or the size is missing: a bare number says nothing. */
export function teamSizeText(label: string | null | undefined, size: number | null): string | null {
  return hasText(label) && size !== null ? `${label}: ${size}` : null;
}

export function TechStack({ value, label }: { value: unknown; label?: string | null | undefined }) {
  const items = Array.isArray(value) ? value.filter(hasText) : [];
  if (items.length === 0) return null;
  return (
    <ul aria-label={label ?? undefined} className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="bg-muted text-muted-foreground rounded-sm px-2 py-0.5 text-xs"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SummarySection({ cv, text }: SectionProps) {
  const maskedText = useMaskedText();
  const isMasked = isMaskedField(cv, 'summary');
  if (isMasked ? maskedText === null : !hasText(cv.summary)) return null;
  return (
    <CvSection title={text?.summary}>
      {isMasked || !hasText(cv.summary) ? <MaskedPlaceholder /> : <Richtext html={cv.summary} />}
    </CvSection>
  );
}

export function SkillsSection({ cv, text }: SectionProps) {
  const skills = (cv.skills ?? []).filter((entry) => hasText(entry.skill));
  if (skills.length === 0) return null;
  return (
    <CvSection title={text?.skills}>
      <ul className="flex flex-wrap gap-2">
        {skills.map((entry, index) => (
          <li
            key={`${entry.skill}-${index}`}
            className="border-border bg-card rounded-md border px-2.5 py-1 text-sm"
          >
            {entry.skill}
            {hasText(entry.level) ? (
              <span className="text-muted-foreground"> · {entry.level}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
