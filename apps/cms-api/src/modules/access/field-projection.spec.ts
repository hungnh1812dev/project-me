import {
  accountAccess,
  ACTORS_BY_KIND,
  profileType,
} from '../../../test/fixtures/masking.fixture';
import type { TableNode } from '../content-engine';
import { projectTable, selectedColumns } from './field-projection';
import { FieldSelection } from './policy-evaluator';
import { recordReadAccess } from './record-read-access';

const type = profileType();

/** Table name -> selected field columns, for every table the projection keeps. */
function shape(table: TableNode): Record<string, string[]> {
  return Object.assign(
    { [table.plan.name]: table.plan.columns.map((column) => column.name) },
    ...table.components.map((component) => shape(component.table)),
  ) as Record<string, string[]>;
}

describe('projectTable (D3)', () => {
  it('returns the registry tree unchanged for ALL', () => {
    expect(projectTable(type.root, FieldSelection.ALL)).toBe(type.root);
  });

  it('keeps only readable columns and tables something readable lies in', () => {
    const projected = projectTable(
      type.root,
      FieldSelection.of(['name', 'seenAt', 'experience.roles.title']),
    );
    expect(shape(projected)).toEqual({
      profile: ['name', 'seen_at'],
      profile__experience: [],
      profile__experience__roles: ['title'],
    });
    expect([...projected.columnsByField.keys()]).toEqual(['name', 'seenAt']);
  });

  it('a granted component keeps its whole subtree', () => {
    const projected = projectTable(
      type.root,
      FieldSelection.of(['experience']),
    );
    expect(shape(projected)).toEqual({
      profile: [],
      profile__experience: ['company', 'years'],
      profile__experience__roles: ['title', 'budget', 'remote'],
    });
  });

  it('selects only system columns when nothing is readable', () => {
    const projected = projectTable(type.root, FieldSelection.NONE);
    expect(projected.components).toEqual([]);
    expect(
      selectedColumns(projected, accountAccess(FieldSelection.NONE)),
    ).toEqual([...type.root.plan.systemColumns]);
  });

  it('does not change the registry plan', () => {
    const before = shape(type.root);
    projectTable(type.root, FieldSelection.NONE);
    expect(shape(type.root)).toEqual(before);
  });

  it('selectedColumns lists system then field columns', () => {
    const projected = projectTable(type.root, FieldSelection.of(['age']));
    expect(
      selectedColumns(projected, accountAccess(FieldSelection.NONE)),
    ).toEqual([...type.root.plan.systemColumns, 'age']);
  });

  it.each(['reviewer', 'anonymous'] as const)(
    'does not select created_by/updated_by for %s actors',
    (kind) => {
      const columns = selectedColumns(
        type.root,
        recordReadAccess(ACTORS_BY_KIND[kind], FieldSelection.ALL),
      );
      expect(columns).not.toContain('created_by');
      expect(columns).not.toContain('updated_by');
      expect(columns).toEqual(
        expect.arrayContaining(['id', 'document_id', 'version', 'created_at']),
      );
    },
  );

  it.each(['account', 'api_token'] as const)(
    'selects created_by/updated_by for %s actors',
    (kind) => {
      expect(
        selectedColumns(
          type.root,
          recordReadAccess(ACTORS_BY_KIND[kind], FieldSelection.ALL),
        ),
      ).toEqual(expect.arrayContaining(['created_by', 'updated_by']));
    },
  );

  it('component tables keep all their system columns', () => {
    const [experience] = type.root.components;
    expect(
      selectedColumns(
        experience!.table,
        recordReadAccess(ACTORS_BY_KIND.anonymous, FieldSelection.ALL),
      ),
    ).toEqual(
      expect.arrayContaining([...experience!.table.plan.systemColumns]),
    );
  });
});
