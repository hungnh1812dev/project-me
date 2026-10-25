import { DomainError } from '../../../common/errors/Domain.errors';
import { coerceFilterValue, typedFilterValues } from './DocumentFilter.rules';

describe('coerceFilterValue', () => {
  it.each([
    ['integer', '42', 42],
    ['integer', '-7', -7],
    ['decimal', '1.50', '1.50'],
    ['boolean', 'true', true],
    ['boolean', 'false', false],
    ['date', '2026-02-28', '2026-02-28'],
    ['datetime', '2026-03-01T10:00:00+07:00', '2026-03-01T03:00:00.000Z'],
    ['datetime', '2026-03-01', '2026-03-01T00:00:00.000Z'],
    [
      'uuid',
      '0A0A0A0A-0A0A-4A0A-8A0A-0A0A0A0A0A0A',
      '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a',
    ],
    ['string', 'anything', 'anything'],
  ] as const)('%s %s', (kind, raw, expected) => {
    expect(coerceFilterValue(kind, raw)).toBe(expected);
  });

  it.each([
    ['integer', '1.5'],
    ['integer', '2147483648'],
    ['integer', '1e3'],
    ['decimal', '1,5'],
    ['decimal', 'NaN'],
    ['boolean', '1'],
    ['boolean', 'TRUE'],
    ['date', '2026-02-31'],
    ['date', '0000-01-01'],
    ['date', '2026-2-1'],
    ['datetime', 'yesterday'],
    ['datetime', '2026-03-01T10:00:00'],
    ['datetime', '0000-01-01T00:00:00Z'],
    ['uuid', 'not-a-uuid'],
  ] as const)('refuses %s %s', (kind, raw) => {
    expect(coerceFilterValue(kind, raw)).toBeUndefined();
  });
});

describe('typedFilterValues', () => {
  const clause = (op: 'eq' | 'in' | 'gt' | 'contains', values: string[]) => ({
    path: 'f',
    op,
    values,
  });

  it('returns the typed values of an allowed operator', () => {
    expect(typedFilterValues('integer', clause('in', ['1', '2']))).toEqual([
      1, 2,
    ]);
  });

  it('refuses an operator the kind does not support', () => {
    expect(() =>
      typedFilterValues('integer', clause('contains', ['1'])),
    ).toThrow(DomainError);
    expect(() => typedFilterValues('boolean', clause('gt', ['true']))).toThrow(
      DomainError,
    );
  });

  it('refuses a value of the wrong type', () => {
    expect(() => typedFilterValues('integer', clause('eq', ['abc']))).toThrow(
      DomainError,
    );
  });
});
