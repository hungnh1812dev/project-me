'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { isSafeLinkTarget } from '@/utils/SafeLinkTarget.rules';

import { isMaskedField, type CvCommonText, type PageCvA, type PageCvSkill } from './PageCv.graphql';

interface SectionProps {
  cv: PageCvA;
  /** The CV labels; `null` when they could not load, so every title is left out. */
  text: CvCommonText | null;
}

export const MUTED_CLASS = 'text-sm text-cv-muted';
/** A block the printer keeps on one page when it fits. */
export const KEEP_TOGETHER_CLASS = 'break-inside-avoid';
const LINK_CLASS = 'text-cv-ink underline-offset-4 hover:underline print:no-underline';
const SECTION_TITLE_CLASS =
  'border-cv-rule text-cv-ink border-b-2 pb-1.5 text-base font-bold tracking-cv-heading uppercase break-after-avoid';
const RICHTEXT_CLASS =
  'text-sm leading-6 [&_a]:text-cv-ink [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-cv-rule [&_blockquote]:pl-3 [&_li]:mt-0.5 [&_li]:break-inside-avoid [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:overflow-x-auto [&_strong]:font-semibold [&_strong]:text-cv-text [&_ul]:list-disc [&_ul]:pl-5';

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
    <span className="border-cv-chip-edge text-cv-muted rounded-sm border border-dashed px-1.5 py-0.5 text-sm italic">
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

/** The frame of one page section: the ruled title when there is one, and the content. */
export function CvSection({
  title,
  children,
}: {
  title?: string | null | undefined;
  children: ReactNode;
}) {
  const hasTitle = hasText(title);
  return (
    <section className="mt-10 print:mt-8">
      {hasTitle ? <h2 className={SECTION_TITLE_CLASS}>{title}</h2> : null}
      <div className={hasTitle ? 'mt-4' : undefined}>{children}</div>
    </section>
  );
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** "Team of 6", or null when the label or the size is missing: a bare number says nothing. */
export function teamSizeText(label: string | null | undefined, size: number | null): string | null {
  return hasText(label) && size !== null ? `${label} ${size}` : null;
}

/** One rounded tag, as used for skills and technologies. */
function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="border-cv-chip-edge bg-cv-chip text-cv-text rounded-full border px-2.5 py-0.5 text-xs leading-5">
      {children}
    </li>
  );
}

/** "Technologies:" and the tags of a role or project; the label is left out when it is missing. */
export function TechStack({ value, label }: { value: unknown; label?: string | null | undefined }) {
  const items = Array.isArray(value) ? value.filter(hasText) : [];
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex items-start gap-2">
      {hasText(label) ? (
        <span className="text-cv-muted shrink-0 pt-0.5 text-sm font-semibold">{label}:</span>
      ) : null}
      <ul aria-label={label ?? undefined} className="flex flex-wrap gap-1.5">
        {items.map((item, index) => (
          <Chip key={`${item}-${index}`}>{item}</Chip>
        ))}
      </ul>
    </div>
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

interface SkillGroup {
  level: string;
  skills: string[];
}

/** The skills grouped by level, in the order each level first appears; a skill with no level groups under an empty level. */
export function groupSkillsByLevel(skills: PageCvSkill[]): SkillGroup[] {
  const groups = new Map<string, string[]>();
  for (const { skill, level } of skills) {
    if (!hasText(skill)) continue;
    const key = hasText(level) ? level : '';
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return [...groups].map(([level, names]) => ({ level, skills: names }));
}

export function SkillsSection({ cv, text }: SectionProps) {
  const groups = groupSkillsByLevel(cv.skills ?? []);
  if (groups.length === 0) return null;
  return (
    <CvSection title={text?.skills}>
      <dl className="space-y-3">
        {groups.map(({ level, skills }) => (
          <div
            key={level}
            className={`flex flex-col gap-1.5 sm:flex-row sm:gap-4 ${KEEP_TOGETHER_CLASS}`}
          >
            <dt className="text-cv-text sm:w-cv-label shrink-0 text-sm font-semibold">{level}</dt>
            <dd>
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((skill, index) => (
                  <Chip key={`${skill}-${index}`}>{skill}</Chip>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </CvSection>
  );
}

export function LanguagesSection({ cv, text }: SectionProps) {
  const languages = (cv.languages ?? []).filter((entry) => hasText(entry.language));
  if (languages.length === 0) return null;
  return (
    <CvSection title={text?.languages}>
      <ul className="flex flex-wrap gap-x-8 gap-y-2">
        {languages.map((entry, index) => (
          <li key={`${entry.language}-${index}`} className="flex items-baseline gap-2">
            <span className="text-cv-text text-base font-semibold">{entry.language}</span>
            {hasText(entry.level) ? (
              <span className="text-cv-muted text-xs">{entry.level}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
