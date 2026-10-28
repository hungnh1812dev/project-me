import type { TokenScopeEntry } from './Access.api';
import {
  sameScopeEntries,
  scopeFromEntries,
  scopeSubjectOrder,
  scopeSummary,
  serializeScope,
  setScopeFieldList,
  toggleScopeCell,
} from './TokenScope.rules';

const entries: TokenScopeEntry[] = [
  { subject: 'article', action: 'read', readableFields: ['title'] },
  { subject: 'article', action: 'update', writableFields: null },
  { subject: '*', action: 'read' },
];

describe('token scope model', () => {
  it('round-trips entries in subject then action order', () => {
    const state = scopeFromEntries(entries);
    const subjects = scopeSubjectOrder(state, ['article']);
    expect(subjects).toEqual(['*', 'article']);
    const { entries: out, cells } = serializeScope(state, subjects);
    expect(out).toEqual([
      { subject: '*', action: 'read' },
      { subject: 'article', action: 'read', readableFields: ['title'] },
      { subject: 'article', action: 'update' },
    ]);
    expect(cells[2]).toEqual({ subject: 'article', action: 'update' });
  });

  it('keeps slugs the token still names but the registry dropped', () => {
    const state = scopeFromEntries([{ subject: 'old', action: 'read' }]);
    expect(scopeSubjectOrder(state, ['article'])).toEqual([
      '*',
      'article',
      'old',
    ]);
  });

  it('grants with all fields and removes a cell again', () => {
    let state = toggleScopeCell(
      {},
      { subject: 'article', action: 'read' },
      true,
    );
    expect(state.article?.read).toEqual({
      readableFields: null,
      writableFields: null,
    });
    state = setScopeFieldList(
      state,
      { subject: 'article', action: 'read' },
      'readableFields',
      ['title'],
    );
    expect(serializeScope(state, ['article']).entries).toEqual([
      { subject: 'article', action: 'read', readableFields: ['title'] },
    ]);
    state = toggleScopeCell(
      state,
      { subject: 'article', action: 'read' },
      false,
    );
    expect(serializeScope(state, ['article']).entries).toEqual([]);
  });

  it('never sends a field list for the wildcard or for delete', () => {
    const state = scopeFromEntries([
      { subject: '*', action: 'read', readableFields: ['x'] },
      { subject: 'article', action: 'delete', writableFields: ['y'] },
    ]);
    expect(serializeScope(state, ['*', 'article']).entries).toEqual([
      { subject: '*', action: 'read' },
      { subject: 'article', action: 'delete' },
    ]);
  });

  it('compares scopes without caring about order or null vs missing', () => {
    expect(
      sameScopeEntries(entries, [
        { subject: '*', action: 'read', readableFields: null },
        { subject: 'article', action: 'update' },
        { subject: 'article', action: 'read', readableFields: ['title'] },
      ]),
    ).toBe(true);
    expect(
      sameScopeEntries(entries, [
        ...entries.slice(0, 2),
        { subject: '*', action: 'create' },
      ]),
    ).toBe(false);
    expect(sameScopeEntries(entries, entries.slice(0, 2))).toBe(false);
  });

  it('summarises permission count and subjects', () => {
    expect(scopeSummary(entries)).toEqual({
      permissions: 3,
      subjects: ['article', '*'],
    });
  });
});
