import type { PermissionRow } from './access.api';
import {
  cellIssues,
  cellsAt,
  fieldListKindOf,
  matrixFromRows,
  parseConditions,
  sameMatrix,
  serializeMatrix,
  setConditionsText,
  setFieldList,
  subjectOrder,
  toggleCell,
  toggleField,
} from './permission-matrix';

function row(
  subject: string,
  action: PermissionRow['action'],
  extra: Partial<PermissionRow> = {},
): PermissionRow {
  return {
    subject,
    action,
    readableFields: null,
    writableFields: null,
    conditions: null,
    ...extra,
  };
}

describe('permission matrix model', () => {
  it('round-trips rows and keeps extra rows of a cell unchanged', () => {
    const rows = [
      row('article', 'read', { readableFields: ['title'] }),
      row('article', 'read', { conditions: { all: [] } }),
      row('roles', 'read'),
    ];
    const state = matrixFromRows(rows);
    const { rows: out } = serializeMatrix(state, ['article', 'roles']);
    expect(out).toHaveLength(3);
    expect(out[0]?.readableFields).toEqual(['title']);
    expect(out[1]?.conditions).toEqual({ all: [] });
  });

  it('grants a new cell with all fields and no conditions, and revokes it', () => {
    const ref = { subject: 'article', action: 'update' } as const;
    const granted = toggleCell({}, ref, true);
    expect(serializeMatrix(granted, ['article']).rows).toEqual([
      row('article', 'update'),
    ]);
    expect(
      serializeMatrix(toggleCell(granted, ref, false), ['article']).rows,
    ).toEqual([]);
  });

  it('only edits the first row of a cell', () => {
    const ref = { subject: 'article', action: 'read' } as const;
    const state = matrixFromRows([
      row('article', 'read'),
      row('article', 'read'),
    ]);
    const next = setFieldList(state, ref, 'readableFields', ['title']);
    const { rows } = serializeMatrix(next, ['article']);
    expect(rows[0]?.readableFields).toEqual(['title']);
    expect(rows[1]?.readableFields).toBeNull();
  });

  it('parses conditions text on save and flags invalid JSON', () => {
    const ref = { subject: 'article', action: 'read' } as const;
    const base = toggleCell({}, ref, true);
    const good = serializeMatrix(setConditionsText(base, ref, '{"all":[]}'), [
      'article',
    ]);
    expect(good.rows[0]?.conditions).toEqual({ all: [] });
    const bad = serializeMatrix(setConditionsText(base, ref, '{oops'), [
      'article',
    ]);
    expect(bad.invalidConditions).toEqual([ref]);
    expect(parseConditions('   ')).toEqual({ ok: true, value: null });
  });

  it('detects unsaved changes', () => {
    const ref = { subject: 'article', action: 'read' } as const;
    const base = matrixFromRows([row('article', 'read')]);
    expect(
      sameMatrix(base, matrixFromRows([row('article', 'read')]), ['article']),
    ).toBe(true);
    expect(sameMatrix(base, toggleCell(base, ref, false), ['article'])).toBe(
      false,
    );
    expect(
      sameMatrix(base, setConditionsText(base, ref, '{"a":1}'), ['article']),
    ).toBe(false);
  });

  it('orders subjects and keeps unknown slugs from the rows', () => {
    const state = matrixFromRows([row('gone', 'read')]);
    const order = subjectOrder(state, ['article']);
    expect(order.content).toEqual(['*', 'article', 'gone']);
    expect(order.system).toContain('accounts');
  });

  it('knows which field list a row carries', () => {
    expect(fieldListKindOf('article', 'read')).toBe('readableFields');
    expect(fieldListKindOf('article', 'update')).toBe('writableFields');
    expect(fieldListKindOf('article', 'delete')).toBeNull();
    expect(fieldListKindOf('*', 'read')).toBeNull();
    expect(fieldListKindOf('accounts', 'read')).toBeNull();
  });

  it('maps API issue and index positions back to cells', () => {
    const cells = [
      { subject: 'article', action: 'read' },
      { subject: 'roles', action: 'update' },
    ] as const;
    const issues = cellIssues(
      [{ path: [1, 'conditions'], message: 'bad' }],
      cells,
    );
    expect([...issues.values()]).toEqual([['bad']]);
    expect(cellsAt([0, 9], cells).size).toBe(1);
  });

  it('a component path covers its subtree', () => {
    expect(toggleField(['a.b', 'c'], 'a', true)).toEqual(['c', 'a']);
    expect(toggleField(['a'], 'a', false)).toEqual([]);
  });
});
