import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { schemaRule, type StandardSchemaV1 } from './standardSchema';

/** A hand-written Standard Schema, standing in for any library that implements the spec. */
const evenNumber: StandardSchemaV1<number> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) =>
      typeof value === 'number' && value % 2 === 0
        ? { value }
        : { issues: [{ message: 'Enter an even number.' }] },
  },
};

describe('schemaRule', () => {
  it('passes a value the schema accepts', () => {
    expect(schemaRule(z.string().email())('ada@example.com')).toBe(true);
    expect(schemaRule(evenNumber)(4)).toBe(true);
  });

  it("gives the first issue's message for a value the schema refuses", () => {
    const rule = schemaRule(
      z
        .string()
        .min(3, 'Use at least 3 characters.')
        .regex(/^[a-z]+$/, 'Use lowercase letters.'),
    );

    expect(rule('A')).toBe('Use at least 3 characters.');
    expect(schemaRule(evenNumber)(3)).toBe('Enter an even number.');
  });

  it('falls back to a generic message for an issue list without one', () => {
    const empty: StandardSchemaV1 = {
      '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [] }) },
    };

    expect(schemaRule(empty)('x')).toBe('Invalid value.');
  });

  it('returns a Promise for an async schema', async () => {
    const taken = z.string().refine(async (name) => name !== 'admin', 'That name is taken.');

    await expect(schemaRule(taken)('admin')).resolves.toBe('That name is taken.');
    await expect(schemaRule(taken)('ada')).resolves.toBe(true);
  });
});
