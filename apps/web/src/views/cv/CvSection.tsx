import { createContext, useContext, type ReactNode } from 'react';

import { isSafeLinkTarget } from '@/utils/SafeLinkTarget.rules';

import { isMaskedField, type PageCvA, type PageCvText } from './PageCv.graphql';

interface SectionProps {
  cv: PageCvA;
  text: PageCvText;
}

export const MUTED_CLASS = 'text-sm text-muted-foreground';
const LINK_CLASS = 'text-primary underline-offset-4 hover:underline';
const SECTION_TITLE_CLASS = 'text-lg font-semibold tracking-tight';
const RICHTEXT_CLASS =
  'text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5';

/** The text a masked value shows; `PageCvClient` provides it from the page text. */
export const MaskedTextContext = createContext<string | null>(null);

/** Stands in for a value the visitor's role may not read. */
export function MaskedPlaceholder() {
  const text = useContext(MaskedTextContext);
  if (text === null) throw new Error('MaskedPlaceholder needs a MaskedTextContext provider');
  return (
    <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-sm italic">
      {text}
    </span>
  );
}

/** A link that opens in a new tab; a target that is not safe renders as text. */
export function ExternalLink({
  href,
  label,
  children,
}: {
  href: string;
  /** Accessible name when the visible text alone is not enough. */
  label?: string;
  children: ReactNode;
}) {
  if (!isSafeLinkTarget(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {children}
    </a>
  );
}

/** Richtext that has already been through `sanitizeCvRichtext`. */
export function Richtext({ html }: { html: string }) {
  return <div className={RICHTEXT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The frame of one page section: a rule, the title and the content. */
export function CvSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border mt-10 border-t pt-6">
      <h2 className={SECTION_TITLE_CLASS}>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function TechStack({ value, label }: { value: unknown; label: string }) {
  const items = Array.isArray(value) ? value.filter(hasText) : [];
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="mt-2 flex flex-wrap gap-1.5">
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
  const isMasked = isMaskedField(cv, 'summary');
  if (!isMasked && !hasText(cv.summary)) return null;
  return (
    <CvSection title={text.sections.summary}>
      {isMasked || !hasText(cv.summary) ? <MaskedPlaceholder /> : <Richtext html={cv.summary} />}
    </CvSection>
  );
}

export function SkillsSection({ cv, text }: SectionProps) {
  const skills = (cv.skills ?? []).filter((entry) => hasText(entry.skill));
  if (skills.length === 0) return null;
  return (
    <CvSection title={text.sections.skills}>
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
