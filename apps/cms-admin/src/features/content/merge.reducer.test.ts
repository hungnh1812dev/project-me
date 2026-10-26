import { MASKED_FIELDS_KEY } from './content.constants';
import { conflictDetails, UID_A, UID_B } from '../../../test/Merge.fixture';
import {
  INITIAL_MERGE_STATE,
  isMaskedPath,
  maskedPathsOf,
  mergeReducer,
  parseEntryPath,
  sideOf,
  visibleEntries,
} from './merge.reducer';

describe('parseEntryPath', () => {
  it('splits value, item and list paths', () => {
    expect(parseEntryPath('values.position')).toEqual({
      steps: [],
      kind: 'value',
      field: 'position',
    });
    expect(parseEntryPath(`components.skill[${UID_A}].values.level`)).toEqual({
      steps: [{ name: 'skill', uid: UID_A }],
      kind: 'value',
      field: 'level',
    });
    expect(parseEntryPath('components.skill[new#2]')).toEqual({
      steps: [{ name: 'skill', uid: 'new#2' }],
      kind: 'item',
    });
    expect(parseEntryPath('components.skill')?.kind).toBe('list');
    expect(
      parseEntryPath(`components.a[${UID_A}].components.b[${UID_B}].values.x`),
    ).toEqual({
      steps: [
        { name: 'a', uid: UID_A },
        { name: 'b', uid: UID_B },
      ],
      kind: 'value',
      field: 'x',
    });
  });

  it('rejects unknown shapes', () => {
    expect(parseEntryPath('other.x')).toBeNull();
    expect(parseEntryPath('values.')).toBeNull();
  });
});

describe('masked fields', () => {
  it('matches a path and its children', () => {
    const masked = new Set(['experience']);
    expect(isMaskedPath('experience.company', masked)).toBe(true);
    expect(isMaskedPath('experiences', masked)).toBe(false);
  });

  it('drops entries of masked fields from the visible diff', () => {
    const details = conflictDetails();
    const masked = maskedPathsOf(details, new Set());
    const paths = visibleEntries(details, masked).map((entry) => entry.path);
    expect(paths).not.toContain('values.company');
    expect(paths).toHaveLength(4);
  });

  it('also honours the masked paths the form already had', () => {
    const details = conflictDetails();
    details.server[MASKED_FIELDS_KEY] = [];
    details.submitted[MASKED_FIELDS_KEY] = [];
    const masked = maskedPathsOf(details, new Set(['company']));
    expect(visibleEntries(details, masked)).toHaveLength(4);
  });
});

describe('mergeReducer', () => {
  it('defaults to the client side and records choices', () => {
    expect(sideOf(INITIAL_MERGE_STATE, 'values.position')).toBe('client');
    const next = mergeReducer(INITIAL_MERGE_STATE, {
      type: 'choose',
      path: 'values.position',
      side: 'server',
    });
    expect(sideOf(next, 'values.position')).toBe('server');
    expect(sideOf(next, 'values.other')).toBe('client');
  });

  it('chooses for all paths and resets', () => {
    const all = mergeReducer(INITIAL_MERGE_STATE, {
      type: 'choose-all',
      paths: ['a', 'b'],
      side: 'server',
    });
    expect(sideOf(all, 'a')).toBe('server');
    expect(sideOf(all, 'b')).toBe('server');
    expect(mergeReducer(all, { type: 'reset' })).toBe(INITIAL_MERGE_STATE);
  });
});
