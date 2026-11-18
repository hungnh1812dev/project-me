const PLACEHOLDER = /\{(\w+)\}/g;

export type TextValues = Readonly<Record<string, string | number>>;

/** Fills `{name}` placeholders; a placeholder with no value stays as written. */
export function formatText(template: string, values: TextValues): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export interface PluralForms {
  one: string;
  other: string;
}

/** English plural: `one` for exactly 1, `other` for every other count. */
export function pickPlural(count: number, forms: PluralForms): string {
  return count === 1 ? forms.one : forms.other;
}
