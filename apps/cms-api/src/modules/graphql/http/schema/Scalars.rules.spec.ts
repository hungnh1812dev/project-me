import { Kind } from 'graphql';

import {
  DateScalar,
  DateTimeScalar,
  DecimalScalar,
  JsonScalar,
} from './Scalars.rules';

describe('scalars', () => {
  it('outputs dates as strings, from a string or a driver Date', () => {
    expect(DateScalar.coerceOutputValue('2026-03-04')).toBe('2026-03-04');
    expect(DateScalar.coerceOutputValue(new Date('2026-03-04T00:00:00Z'))).toBe(
      '2026-03-04',
    );
    expect(
      DateTimeScalar.coerceOutputValue(new Date('2026-03-04T05:06:07Z')),
    ).toBe('2026-03-04T05:06:07.000Z');
    expect(DateTimeScalar.coerceOutputValue('2026-03-04T05:06:07Z')).toBe(
      '2026-03-04T05:06:07Z',
    );
  });

  it('outputs a decimal as a string', () => {
    expect(DecimalScalar.coerceOutputValue('12.50')).toBe('12.50');
    expect(DecimalScalar.coerceOutputValue(3)).toBe('3');
  });

  it('rejects an output that is not a string', () => {
    expect(() => DateScalar.coerceOutputValue(5)).toThrow('must be a string');
  });

  it('accepts well-formed input values and literals', () => {
    expect(DateScalar.coerceInputValue('2026-03-04')).toBe('2026-03-04');
    expect(DateTimeScalar.coerceInputValue('2026-03-04T05:06:07Z')).toBe(
      '2026-03-04T05:06:07Z',
    );
    expect(DecimalScalar.coerceInputValue('-1.25')).toBe('-1.25');
    expect(
      DecimalScalar.coerceInputLiteral?.({ kind: Kind.STRING, value: '1.5' }),
    ).toBe('1.5');
  });

  it('rejects malformed input values and non-string literals', () => {
    expect(() => DateScalar.coerceInputValue('03/04/2026')).toThrow(
      'invalid format',
    );
    expect(() => DateScalar.coerceInputValue(20260304)).toThrow(
      'must be a string',
    );
    expect(() => DateTimeScalar.coerceInputValue('yesterday')).toThrow(
      'invalid format',
    );
    expect(() => DecimalScalar.coerceInputValue('1e5')).toThrow(
      'invalid format',
    );
    expect(() =>
      DecimalScalar.coerceInputLiteral?.({ kind: Kind.INT, value: '1' }),
    ).toThrow('must be a string');
  });

  it('passes JSON through unchanged', () => {
    const value = { a: [1, 'b', null] };
    expect(JsonScalar.coerceOutputValue(value)).toBe(value);
    expect(
      JsonScalar.coerceInputLiteral?.({ kind: Kind.BOOLEAN, value: true }),
    ).toBe(true);
  });
});
