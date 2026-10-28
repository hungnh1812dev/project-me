import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COPY } from '../../config/Copy.constants';
import { FIELD_TYPE, MASKED_VALUE } from './Content.constants';
import {
  adapterFor,
  FIELD_REGISTRY,
  formatListValue,
  isSortableListType,
  listAlignmentOf,
} from './Field.registry';

describe('adapterFor richtext', () => {
  const adapter = adapterFor('richtext');

  it('is editable and round-trips HTML text', () => {
    expect(adapter.editable).toBe(true);
    expect(adapter.toForm('<p>x</p>')).toBe('<p>x</p>');
    expect(adapter.toForm(null)).toBe('');
    expect(adapter.toApi('<p>x</p>')).toBe('<p>x</p>');
    expect(adapter.toApi('')).toBeNull();
  });
});

describe('adapterFor media', () => {
  const adapter = adapterFor('media');
  const file = { id: 'u1', fileName: 'a.jpg' };

  it('is editable, keeps the embedded file and sends only its uuid', () => {
    expect(adapter.editable).toBe(true);
    expect(adapter.toForm(file)).toEqual(file);
    expect(adapter.toForm(null)).toBeNull();
    expect(adapter.toForm(7)).toBeNull();
    expect(adapter.toApi(file)).toBe('u1');
    expect(adapter.toApi(null)).toBeNull();
  });
});

describe('list display', () => {
  it('has an entry for every non-component field type', () => {
    const types = Object.values(FIELD_TYPE).filter(
      (type) => type !== FIELD_TYPE.COMPONENT,
    );
    expect(types.filter((type) => !(type in FIELD_REGISTRY))).toEqual([]);
  });

  it('marks scalar types sortable and the rest not', () => {
    expect(isSortableListType('string')).toBe(true);
    expect(isSortableListType('datetime')).toBe(true);
    expect(isSortableListType('json')).toBe(false);
    expect(isSortableListType('richtext')).toBe(false);
    expect(isSortableListType('media')).toBe(false);
    expect(isSortableListType('unknown')).toBe(false);
  });

  it('right-aligns numbers only', () => {
    expect(listAlignmentOf('integer')).toBe('right');
    expect(listAlignmentOf('decimal')).toBe('right');
    expect(listAlignmentOf('string')).toBe('left');
  });

  it('formats empty, masked, boolean, datetime and plain values', () => {
    const empty = COPY.content.collection.emptyValue;
    expect(formatListValue('string', null)).toBe(empty);
    expect(formatListValue('string', '')).toBe(empty);
    expect(formatListValue('string', MASKED_VALUE)).toBe(
      COPY.content.collection.protectedValue,
    );
    expect(formatListValue('boolean', true)).toBe(COPY.content.collection.yes);
    expect(formatListValue('boolean', false)).toBe(COPY.content.collection.no);
    expect(formatListValue('integer', 7)).toBe('7');
    expect(formatListValue('string', { a: 1 })).toBe(empty);
    expect(formatListValue('datetime', 'not a date')).toBe('not a date');
    expect(formatListValue('datetime', '2026-01-02T03:04:05Z')).not.toBe(empty);
  });

  it('keeps CollectionListPage free of FIELD_TYPE', () => {
    const page = readFileSync(
      join(import.meta.dirname, 'CollectionListPage.tsx'),
      'utf8',
    );
    expect(page).not.toContain('FIELD_TYPE');
  });
});
