import { BadRequestException } from '@nestjs/common';

import { FieldSelection } from '../access';
import { RegistryService } from '../content-engine/registry.service';
import { profileType } from '../../../test/fixtures/masking.fixture';
import { validateTreeValues } from './value-validator';

const profile = profileType();
const required = RegistryService.fromDefinitions([
  {
    slug: 'req',
    kind: 'collection',
    draftAndPublish: true,
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'notes', type: 'text' },
      {
        name: 'items',
        type: 'component',
        repeatable: true,
        required: true,
        fields: [{ name: 'label', type: 'string', required: true }],
      },
    ],
  },
]).resolve('req');

function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return (
      (error as BadRequestException).getResponse() as { errorCode: string }
    ).errorCode;
  }
  return undefined;
}
const run = (tree: object, mode: 'create' | 'update', type = profile) =>
  validateTreeValues(type.root, tree, {
    mode,
    writable: FieldSelection.ALL,
  });

describe('write value rules (T21)', () => {
  it('accepts a value of every type and normalizes datetimes', () => {
    const out = run(
      {
        values: {
          name: 'a',
          summary: 'b',
          bio: '<p>c</p>',
          salary: '10.50',
          age: 41,
          active: false,
          born: '2000-02-29',
          seenAt: '2026-03-01T10:00:00+02:00',
          meta: { any: ['json'] },
          avatar: '0190A000-0000-7000-8000-000000000001',
        },
      },
      'update',
    );
    expect(out.values?.seenAt).toBe('2026-03-01T08:00:00.000Z');
    expect(out.values?.meta).toEqual({ any: ['json'] });
    expect(out.values?.avatar).toBe('0190a000-0000-7000-8000-000000000001');
  });

  it.each([
    ['name', 5],
    ['age', 1.5],
    ['age', 3_000_000_000],
    ['salary', 'abc'],
    ['salary', Number.POSITIVE_INFINITY],
    ['active', 'true'],
    ['born', '2026-02-30'],
    ['seenAt', 'yesterday'],
    ['avatar', 0],
    ['avatar', 5],
    ['avatar', 'not-a-uuid'],
  ])('rejects %s = %p with 400 DOCUMENT_INVALID', (field, value) => {
    expect(() => run({ values: { [field]: value } }, 'update')).toThrow(
      BadRequestException,
    );
    expect(codeOf(() => run({ values: { [field]: value } }, 'update'))).toBe(
      'DOCUMENT_INVALID',
    );
  });

  it('allows null for optional and rejects it for required fields', () => {
    expect(run({ values: { name: null } }, 'update').values).toEqual({
      name: null,
    });
    expect(() => run({ values: { title: null } }, 'update', required)).toThrow(
      /values\.title is required/,
    );
  });

  it('requires required fields on create, but not on update', () => {
    expect(() => run({}, 'create', required)).toThrow(/values\.title/);
    expect(() => run({ values: { title: 't' } }, 'create', required)).toThrow(
      /components\.items/,
    );
    expect(() =>
      run(
        { values: { title: 't' }, components: { items: [] } },
        'create',
        required,
      ),
    ).toThrow(/components\.items is required/);
    expect(() =>
      run(
        { values: { title: 't' }, components: { items: [{ values: {} }] } },
        'create',
        required,
      ),
    ).toThrow(/items\[0\]\.values\.label/);
    expect(run({ values: { notes: 'n' } }, 'update', required)).toEqual({
      values: { notes: 'n' },
    });
  });

  it('does not require a field the actor cannot write', () => {
    const out = validateTreeValues(
      required.root,
      {},
      { mode: 'create', writable: FieldSelection.of([]) },
    );
    expect(out).toEqual({ values: {} });
  });

  it('error messages carry the path, never the value', () => {
    expect(() => run({ values: { age: 'SECRET-VALUE' } }, 'update')).toThrow(
      /^values\.age does not match/,
    );
  });
});
