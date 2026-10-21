import { OPERATORS_BY_KIND } from '../../documents/documents.constants';
import { FILTER_INPUTS, filterToClauses, sortToKeys } from './filter-inputs';

describe('FILTER_INPUTS', () => {
  it('offers exactly the REST operators of each kind', () => {
    for (const [kind, input] of Object.entries(FILTER_INPUTS)) {
      expect(Object.keys(input.getFields())).toEqual([
        ...OPERATORS_BY_KIND[kind as keyof typeof OPERATORS_BY_KIND],
      ]);
    }
  });

  it('types the operands by kind', () => {
    const printed = (kind: keyof typeof FILTER_INPUTS) =>
      Object.fromEntries(
        Object.entries(FILTER_INPUTS[kind].getFields()).map(([name, f]) => [
          name,
          String(f.type),
        ]),
      );
    expect(printed('string')).toEqual({
      eq: 'String',
      ne: 'String',
      in: '[String!]',
      contains: 'String',
    });
    expect(printed('integer')).toMatchObject({ gt: 'Int', in: '[Int!]' });
    expect(printed('decimal')).toMatchObject({ lte: 'Decimal' });
    expect(printed('date')).toMatchObject({ gte: 'Date' });
    expect(printed('datetime')).toMatchObject({ lt: 'DateTime' });
    expect(printed('boolean')).toEqual({
      eq: 'Boolean',
      ne: 'Boolean',
      in: '[Boolean!]',
    });
    expect(printed('uuid')).toEqual({ eq: 'ID', ne: 'ID', in: '[ID!]' });
  });
});

describe('filterToClauses', () => {
  it('makes one REST clause per operator with stringified values', () => {
    expect(
      filterToClauses({
        isMain: { eq: true },
        version: { gte: 2, lt: 10 },
        position: { in: ['a', 'b'], contains: 'dev' },
      }),
    ).toEqual([
      { path: 'isMain', op: 'eq', values: ['true'] },
      { path: 'version', op: 'gte', values: ['2'] },
      { path: 'version', op: 'lt', values: ['10'] },
      { path: 'position', op: 'in', values: ['a', 'b'] },
      { path: 'position', op: 'contains', values: ['dev'] },
    ]);
  });

  it('ignores absent and null entries and unknown operators', () => {
    expect(filterToClauses(undefined)).toEqual([]);
    expect(filterToClauses(null)).toEqual([]);
    expect(
      filterToClauses({ a: null, b: { eq: null, bogus: 'x' }, c: {} }),
    ).toEqual([]);
  });
});

describe('sortToKeys', () => {
  it('maps the sort entries and defaults the direction to ascending', () => {
    expect(
      sortToKeys([
        { field: 'updatedAt', direction: 'desc' },
        { field: 'title' },
      ]),
    ).toEqual([
      { path: 'updatedAt', direction: 'desc' },
      { path: 'title', direction: 'asc' },
    ]);
    expect(sortToKeys(undefined)).toEqual([]);
  });
});
