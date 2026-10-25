import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFINITION_RULES,
  MAX_IDENTIFIER_BYTES,
} from './ContentEngine.constants';
import {
  type DefinitionValidationError,
  formatDefinitionPath,
  validateDefinition,
  validateDefinitions,
} from './DefinitionValidator.rules';

const CV_PAGE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'content',
  'schemas',
  'cv-page.json',
);

type Field = Record<string, unknown>;

function definition(fields: Field[], slug = 'post'): Record<string, unknown> {
  return { slug, kind: 'collection', draftAndPublish: true, fields };
}

function component(name: string, fields: Field[]): Field {
  return { name, type: 'component', repeatable: true, fields };
}

/** Root -> c1 -> c2 -> ... -> c<depth>, the deepest holding one string field. */
function nested(depth: number): Field[] {
  let fields: Field[] = [{ name: 'title', type: 'string' }];
  for (let level = depth; level >= 1; level -= 1) {
    fields = [component(`c${level}`, fields)];
  }
  return fields;
}

/** Typed wrapper so asymmetric matchers can sit in typed object literals. */
function containing(text: string): unknown {
  return expect.stringContaining(text);
}

function errorsOf(input: unknown): DefinitionValidationError[] {
  const result = validateDefinition(input);
  if (result.ok) throw new Error('expected the definition to be rejected');
  return result.errors;
}

function rulesOf(input: unknown): string[] {
  return errorsOf(input).map((error) => error.rule);
}

describe('validateDefinition', () => {
  describe('cv-page.json', () => {
    const cvPage: unknown = JSON.parse(readFileSync(CV_PAGE_PATH, 'utf8'));

    it('is accepted', () => {
      expect(validateDefinition(cvPage)).toMatchObject({
        ok: true,
        definition: { slug: 'cv-page' },
        tables: { length: 8 },
      });
    });

    it('has no sensitive flag until Q5 is answered', () => {
      expect(JSON.stringify(cvPage)).not.toContain('sensitive');
    });
  });

  it('accepts every scalar field type and the optional hints', () => {
    const result = validateDefinition({
      slug: 'about',
      kind: 'single',
      draftAndPublish: false,
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'intro', type: 'text' },
        { name: 'body', type: 'richtext' },
        { name: 'years', type: 'integer' },
        { name: 'salary', type: 'decimal', sensitive: true },
        { name: 'available', type: 'boolean' },
        { name: 'birthDate', type: 'date' },
        { name: 'lastSeenAt', type: 'datetime' },
        { name: 'meta', type: 'json' },
        { name: 'photo', type: 'media' },
        {
          name: 'address',
          type: 'component',
          fields: [{ name: 'city', type: 'string' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  describe('shape (schema.invalid)', () => {
    it.each<[string, unknown]>([
      ['a non-object', 'cv-page'],
      [
        'a missing draftAndPublish',
        {
          slug: 'post',
          kind: 'collection',
          fields: [{ name: 'a', type: 'string' }],
        },
      ],
      [
        'an unknown kind',
        { ...definition([{ name: 'a', type: 'string' }]), kind: 'list' },
      ],
      [
        'an unknown top-level key',
        { ...definition([{ name: 'a', type: 'string' }]), extra: 1 },
      ],
      ['an empty field list', definition([])],
      ['an unknown field type', definition([{ name: 'a', type: 'uuid' }])],
      [
        'an unknown field key',
        definition([{ name: 'a', type: 'string', width: 50 }]),
      ],
      [
        'a component without fields',
        definition([{ name: 'a', type: 'component' }]),
      ],
      ['a component with no children', definition([component('a', [])])],
      [
        'a scalar with children',
        definition([{ name: 'a', type: 'string', fields: [] }]),
      ],
      [
        'repeatable on a scalar',
        definition([{ name: 'a', type: 'string', repeatable: true }]),
      ],
      [
        'a non-boolean sensitive',
        definition([{ name: 'a', type: 'string', sensitive: 'yes' }]),
      ],
    ])('rejects %s', (_label, input) => {
      const errors = errorsOf(input);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.every((e) => e.rule === DEFINITION_RULES.SCHEMA_INVALID),
      ).toBe(true);
    });

    it('points at the offending key', () => {
      const [error] = errorsOf(
        definition([component('a', [{ name: 'b', type: 'uuid' }])]),
      );
      expect(error?.path).toEqual(['fields', 0, 'fields', 0, 'type']);
    });
  });

  describe('component depth (component.depth_exceeded)', () => {
    it('accepts 3 levels', () => {
      expect(validateDefinition(definition(nested(3))).ok).toBe(true);
    });

    it('rejects a 4th level at the component that crosses the limit', () => {
      expect(errorsOf(definition(nested(4)))).toEqual([
        {
          path: ['fields', 0, 'fields', 0, 'fields', 0, 'fields', 0],
          rule: DEFINITION_RULES.COMPONENT_DEPTH_EXCEEDED,
          message: containing('depth 4'),
        },
      ]);
    });
  });

  describe('identifier rule (identifier.invalid)', () => {
    it.each([
      'CV-page',
      'cv_page',
      'cv--page',
      '1cv',
      'cv-page-',
      '-cv',
      'cv page',
    ])('rejects slug %j', (slug) => {
      expect(
        errorsOf(definition([{ name: 'a', type: 'string' }], slug)),
      ).toEqual([
        expect.objectContaining({
          path: ['slug'],
          rule: DEFINITION_RULES.IDENTIFIER_INVALID,
        }),
      ]);
    });

    it.each([
      'TeamSize',
      '1team',
      'team-size',
      'team size',
      'têam',
      'team__size',
      'team_B',
      'team_',
      '_team',
    ])('rejects field name %j', (name) => {
      expect(errorsOf(definition([{ name, type: 'string' }]))).toEqual([
        expect.objectContaining({
          path: ['fields', 0, 'name'],
          rule: DEFINITION_RULES.IDENTIFIER_INVALID,
        }),
      ]);
    });

    it('checks names inside components too', () => {
      expect(
        errorsOf(
          definition([component('items', [{ name: 'Bad', type: 'string' }])]),
        ),
      ).toEqual([
        expect.objectContaining({ path: ['fields', 0, 'fields', 0, 'name'] }),
      ]);
    });
  });

  describe('reserved names (identifier.reserved)', () => {
    it.each([
      'id',
      'documentId',
      'document_id',
      'parentId',
      'componentUid',
      'orderIndex',
      'version',
      'status',
      'publishedAt',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'locale',
    ])('rejects engine-owned %j', (name) => {
      expect(rulesOf(definition([{ name, type: 'string' }]))).toEqual([
        DEFINITION_RULES.IDENTIFIER_RESERVED,
      ]);
    });

    it.each(['order', 'user', 'select', 'table', 'group', 'limit'])(
      'rejects SQL keyword %j as a field or component name',
      (name) => {
        expect(rulesOf(definition([{ name, type: 'string' }]))).toEqual([
          DEFINITION_RULES.IDENTIFIER_RESERVED,
        ]);
        expect(
          rulesOf(
            definition([component(name, [{ name: 'a', type: 'string' }])]),
          ),
        ).toEqual([DEFINITION_RULES.IDENTIFIER_RESERVED]);
      },
    );

    it('rejects a slug that maps to an SQL keyword', () => {
      expect(
        rulesOf(definition([{ name: 'a', type: 'string' }], 'user')),
      ).toEqual([DEFINITION_RULES.IDENTIFIER_RESERVED]);
    });

    it('allows non-reserved keywords used by cv-page', () => {
      const fields = ['position', 'role', 'level', 'name', 'language'].map(
        (name) => ({
          name,
          type: 'string',
        }),
      );
      expect(validateDefinition(definition(fields)).ok).toBe(true);
    });
  });

  describe('composed length (identifier.too_long)', () => {
    const bytes = (length: number) => 'a'.repeat(length);

    it('accepts a 63-byte column and rejects a 64-byte one', () => {
      expect(
        validateDefinition(
          definition([{ name: bytes(MAX_IDENTIFIER_BYTES), type: 'string' }]),
        ).ok,
      ).toBe(true);
      expect(
        errorsOf(
          definition([
            { name: bytes(MAX_IDENTIFIER_BYTES + 1), type: 'string' },
          ]),
        ),
      ).toEqual([
        expect.objectContaining({
          path: ['fields', 0, 'name'],
          rule: DEFINITION_RULES.IDENTIFIER_TOO_LONG,
          message: containing('64 bytes'),
        }),
      ]);
    });

    it('rejects a slug whose root index name exceeds 63 bytes', () => {
      // `<slug>_published_idx` adds 14 bytes, so 49 is the longest root table.
      const field = [{ name: 'a', type: 'string' }];
      expect(validateDefinition(definition(field, bytes(49))).ok).toBe(true);
      expect(errorsOf(definition(field, bytes(50)))).toEqual([
        expect.objectContaining({
          path: ['slug'],
          rule: DEFINITION_RULES.IDENTIFIER_TOO_LONG,
          message: containing(`${bytes(50)}_published_idx`),
        }),
      ]);
    });

    it('rejects a component table whose composed path exceeds 63 bytes', () => {
      const deep = definition(
        [
          component('experience', [
            component(bytes(43), [{ name: 'a', type: 'string' }]),
          ]),
        ],
        'cv-page',
      );
      expect(errorsOf(deep)).toEqual([
        expect.objectContaining({
          path: ['fields', 0, 'fields', 0, 'name'],
          rule: DEFINITION_RULES.IDENTIFIER_TOO_LONG,
          message: containing(`Table name "cv_page__experience__${bytes(43)}"`),
        }),
      ]);
    });

    it('rejects a component whose parent index name exceeds 63 bytes', () => {
      // `cv_page__` (9) + 44 = 53-byte table; `_parent_idx` makes it 64.
      expect(
        rulesOf(
          definition(
            [component(bytes(44), [{ name: 'a', type: 'string' }])],
            'cv-page',
          ),
        ),
      ).toEqual([DEFINITION_RULES.IDENTIFIER_TOO_LONG]);
      expect(
        validateDefinition(
          definition(
            [component(bytes(43), [{ name: 'a', type: 'string' }])],
            'cv-page',
          ),
        ).ok,
      ).toBe(true);
    });

    it('rejects a media column whose foreign key name exceeds 63 bytes', () => {
      // `post_` + 49 + `_media_fk` = 63 bytes.
      expect(
        validateDefinition(definition([{ name: bytes(49), type: 'media' }])).ok,
      ).toBe(true);
      expect(
        errorsOf(definition([{ name: bytes(50), type: 'media' }])),
      ).toEqual([
        expect.objectContaining({
          path: ['fields', 0, 'name'],
          rule: DEFINITION_RULES.IDENTIFIER_TOO_LONG,
        }),
      ]);
    });

    it('reports a non-ASCII name as invalid, not as too long', () => {
      // Names must be ASCII, so composed names are measured only after the
      // identifier rule passed; bytes then equal characters.
      expect(
        rulesOf(definition([{ name: `${bytes(40)}é`, type: 'string' }])),
      ).toEqual([DEFINITION_RULES.IDENTIFIER_INVALID]);
    });
  });

  describe('collisions after normalisation (identifier.collision)', () => {
    it('rejects camelCase and snake_case spellings of the same column', () => {
      expect(
        errorsOf(
          definition([
            { name: 'teamSize', type: 'integer' },
            { name: 'team_size', type: 'integer' },
          ]),
        ),
      ).toEqual([
        expect.objectContaining({
          path: ['fields', 1, 'name'],
          rule: DEFINITION_RULES.IDENTIFIER_COLLISION,
          message: containing('"team_size" and "teamSize"'),
        }),
      ]);
    });

    it('rejects a duplicate field name', () => {
      expect(
        rulesOf(
          definition([
            { name: 'title', type: 'string' },
            component('title', [{ name: 'a', type: 'string' }]),
          ]),
        ),
      ).toEqual([DEFINITION_RULES.IDENTIFIER_COLLISION]);
    });

    it('allows the same name at different levels', () => {
      expect(
        validateDefinition(
          definition([
            { name: 'role', type: 'string' },
            component('items', [{ name: 'role', type: 'string' }]),
          ]),
        ).ok,
      ).toBe(true);
    });
  });

  it('collects every error instead of stopping at the first', () => {
    const errors = errorsOf(
      definition(
        [
          { name: 'id', type: 'string' },
          { name: 'Bad', type: 'string' },
          ...nested(4),
        ],
        'Bad',
      ),
    );
    expect(errors.map((error) => error.rule).sort()).toEqual(
      [
        DEFINITION_RULES.COMPONENT_DEPTH_EXCEEDED,
        DEFINITION_RULES.IDENTIFIER_INVALID,
        DEFINITION_RULES.IDENTIFIER_INVALID,
        DEFINITION_RULES.IDENTIFIER_RESERVED,
      ].sort(),
    );
    for (const error of errors) {
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});

describe('validateDefinitions', () => {
  const simple = (slug: string) =>
    definition([{ name: 'title', type: 'string' }], slug);

  it('accepts distinct definitions', () => {
    expect(
      validateDefinitions([simple('post'), simple('cv-page')]),
    ).toMatchObject({ ok: true, definitions: { length: 2 } });
  });

  it('rejects two definitions with the same slug', () => {
    expect(validateDefinitions([simple('post'), simple('post')])).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          path: [1, 'slug'],
          rule: DEFINITION_RULES.IDENTIFIER_COLLISION,
        }),
      ]) as unknown,
    });
  });

  it('rejects a table that collides with another table index name', () => {
    // `post` owns the index `post_pk`; slug `post-pk` maps to table `post_pk`.
    const result = validateDefinitions([simple('post'), simple('post-pk')]);
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          path: [1, 'slug'],
          rule: DEFINITION_RULES.IDENTIFIER_COLLISION,
          message: containing('"post_pk"'),
        }),
      ],
    });
  });

  it('prefixes per-definition errors with the list index', () => {
    const result = validateDefinitions([simple('post'), simple('Bad')]);
    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          path: [1, 'slug'],
          rule: DEFINITION_RULES.IDENTIFIER_INVALID,
        }),
      ],
    });
  });
});

describe('formatDefinitionPath', () => {
  it('renders a readable path', () => {
    expect(formatDefinitionPath(['fields', 2, 'fields', 0, 'name'])).toBe(
      'fields[2].fields[0].name',
    );
    expect(formatDefinitionPath([1, 'slug'])).toBe('[1].slug');
    expect(formatDefinitionPath([])).toBe('');
  });
});
