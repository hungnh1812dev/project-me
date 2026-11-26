import { EN_TEXT } from '@configs/locales/en';

import { MASKED_VALUE } from './Content.constants';
import type { FieldNode } from './FieldTree.rules';
import { itemHeaderTextOf, oneLineTextOf } from './ItemHeader.rules';

const copy = EN_TEXT.content.list;

const child = (name: string, type: string): FieldNode => ({
  name,
  path: `jobs.${name}`,
  type,
  label: name,
  width: 'full',
  repeatable: false,
  children: [],
});

const jobs = (keys: Partial<Pick<FieldNode, 'titleField' | 'subtitleField'>>): FieldNode => ({
  name: 'jobs',
  path: 'jobs',
  type: 'component',
  label: 'Jobs',
  width: 'full',
  repeatable: true,
  children: [child('role', 'string'), child('company', 'text'), child('years', 'integer')],
  ...keys,
});

const none: ReadonlySet<string> = new Set();

describe('oneLineTextOf', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['  Lead  ', 'Lead'],
    ['first\nsecond', 'first'],
    ['first\r\nsecond', 'first'],
    [7, '7'],
    [true, 'true'],
  ])('%j -> %j', (value, text) => {
    expect(oneLineTextOf(value)).toBe(text);
  });
});

describe('itemHeaderTextOf', () => {
  const header = (
    node: FieldNode,
    values: Record<string, unknown>,
    masked: ReadonlySet<string> = none,
  ) => itemHeaderTextOf(node, values, masked, 2, copy);

  it('shows the title after the position', () => {
    expect(header(jobs({ titleField: 'role' }), { role: 'Lead' })).toBe('2: Lead');
  });

  it('adds the subtitle after the title', () => {
    const node = jobs({ titleField: 'role', subtitleField: 'company' });
    expect(header(node, { role: 'Lead', company: 'Acme' })).toBe('2: Lead - Acme');
  });

  it('shows the subtitle alone when the title is empty', () => {
    const node = jobs({ titleField: 'role', subtitleField: 'company' });
    expect(header(node, { role: '  ', company: 'Acme' })).toBe('2: Acme');
  });

  it('omits the separator when the subtitle is empty', () => {
    const node = jobs({ titleField: 'role', subtitleField: 'company' });
    expect(header(node, { role: 'Lead', company: '' })).toBe('2: Lead');
  });

  it('falls back to the label and position when both are empty', () => {
    const node = jobs({ titleField: 'role', subtitleField: 'company' });
    expect(header(node, { role: '', company: '' })).toBe('Jobs 2');
  });

  it('falls back when the component sets no titleField', () => {
    expect(header(jobs({}), { role: 'Lead' })).toBe('Jobs 2');
  });

  it('reads a number type as its text', () => {
    expect(header(jobs({ titleField: 'years' }), { years: '12' })).toBe('2: 12');
  });

  it('takes the first line of a multi-line value', () => {
    expect(header(jobs({ titleField: 'role' }), { role: 'Lead\nSecond line' })).toBe('2: Lead');
  });

  it('counts a child the reader cannot see as empty', () => {
    const node = jobs({ titleField: 'role', subtitleField: 'secret' });
    expect(header(node, { role: 'Lead', secret: 'x' })).toBe('2: Lead');
  });

  it('counts a masked path as empty', () => {
    const node = jobs({ titleField: 'role', subtitleField: 'company' });
    expect(header(node, { role: 'Lead', company: 'Acme' }, new Set(['jobs.company']))).toBe(
      '2: Lead',
    );
  });

  it('counts the masked placeholder as empty', () => {
    expect(header(jobs({ titleField: 'role' }), { role: MASKED_VALUE })).toBe('Jobs 2');
  });
});
