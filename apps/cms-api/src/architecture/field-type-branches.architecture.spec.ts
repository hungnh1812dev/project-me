import { join } from 'node:path';

import { SCALAR_FIELD_TYPES } from '../modules/content-engine/domain/ContentEngine.constants';
import { findFieldTypeBranches } from './field-type-literals';
import { assertPinnedPathsExist, listSourceFiles } from './import-graph';
import {
  FIELD_TYPES_DIRECTORY,
  VALUE_KIND_SWITCH_FILES,
} from './source-paths.constants';

/**
 * SPEC D12 (R2-05): what a scalar field type means is decided in
 * `content-engine/field-types/`. Code elsewhere reads the registry
 * (`fieldTypeOf`) and never branches on a quoted field type name.
 */
const SRC_ROOT = join(__dirname, '..');
const GENERATED_DIRECTORY = 'generated';

// VALUE_KIND_SWITCH_FILES: exhaustive switches over a value kind
// (`FieldValueKind`, SPEC 13-C). Their case names coincide with some field
// type names, but they decide on the kind the registry hands out.

describe('field type branches (D12)', () => {
  const sources = listSourceFiles(SRC_ROOT).filter(
    ({ file }) =>
      !file.startsWith(FIELD_TYPES_DIRECTORY) &&
      !file.startsWith(GENERATED_DIRECTORY) &&
      !VALUE_KIND_SWITCH_FILES.includes(file),
  );

  it('scans the source tree', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('has no case or comparison on a scalar field type outside the registry', () => {
    const offenders = sources.flatMap(({ file, text }) =>
      findFieldTypeBranches(text, SCALAR_FIELD_TYPES).map(
        ({ type, line }) => `${file}:${line}: '${type}'`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('value kind switch files', () => {
  it('exist', () => {
    expect(() =>
      assertPinnedPathsExist(SRC_ROOT, [
        ...VALUE_KIND_SWITCH_FILES,
        FIELD_TYPES_DIRECTORY,
      ]),
    ).not.toThrow();
  });
});

describe('findFieldTypeBranches', () => {
  const scan = (code: string) =>
    findFieldTypeBranches(code, SCALAR_FIELD_TYPES).map(({ type }) => type);

  it('finds case labels and comparisons on either side', () => {
    expect(
      scan(
        `switch (t) { case 'media': break; }\nif (x.type === 'text') {}\nif ('json' !== y) {}`,
      ),
    ).toEqual(['media', 'text', 'json']);
  });

  it('ignores other literals, non-comparison uses and typeof checks', () => {
    expect(
      scan(
        `const a = 'text'; if (x === 'other') {} if (typeof v === 'string') {}`,
      ),
    ).toEqual([]);
  });
});
