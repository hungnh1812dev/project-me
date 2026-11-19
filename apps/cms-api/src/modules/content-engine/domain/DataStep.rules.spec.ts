import { DataStepError, parseDataStep, undeclaredDestructiveChanges } from './DataStep.rules';
import type { DestructiveChange } from './SqlGenerator.rules';

const UPDATE = 'UPDATE "content"."header" SET "app_name" = "name";';

describe('data-step', () => {
  describe('parseDataStep', () => {
    it('reads both declaration kinds with targets of both forms', () => {
      const step = parseDataStep(
        [
          '-- carries header.name',
          '-- Discards header.nav_label: user 2026-11-19',
          '-- carries header__nav__sub_navigation',
          UPDATE,
        ].join('\n'),
      );
      expect(step.declarations).toEqual([
        { target: 'header.name', kind: 'carries' },
        { target: 'header.nav_label', kind: 'discards', reason: 'user 2026-11-19' },
        { target: 'header__nav__sub_navigation', kind: 'carries' },
      ]);
      expect(step.body.endsWith(UPDATE)).toBe(true);
    });

    it('allows DO blocks that contain BEGIN and statements with semicolons in strings', () => {
      expect(() =>
        parseDataStep(
          "DO $$ BEGIN IF true THEN RAISE EXCEPTION 'a;b'; END IF; END $$;\nUPDATE t SET a = 'DROP;';",
        ),
      ).not.toThrow();
    });

    it('refuses a data step with no statement', () => {
      expect(() => parseDataStep('-- carries header.name\n/* nothing */')).toThrow(DataStepError);
      expect(() => parseDataStep('  ')).toThrow(/no statement/);
    });

    it.each([
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'SAVEPOINT x',
      'TRUNCATE t',
      'DROP TABLE t',
      'ALTER TABLE t ADD a int',
      'CREATE TABLE t (a int)',
    ])('refuses %s, in any case and after the first statement', (statement) => {
      expect(() => parseDataStep(statement)).toThrow(DataStepError);
      expect(() => parseDataStep(`${UPDATE}\n${statement.toLowerCase()};`)).toThrow(DataStepError);
    });

    it('refuses a discards line without a reason', () => {
      expect(() => parseDataStep(`-- discards header.nav_label\n${UPDATE}`)).toThrow(/reason/);
      expect(() => parseDataStep(`-- discards header.nav_label:  \n${UPDATE}`)).toThrow(/reason/);
    });

    it('refuses a malformed target', () => {
      expect(() => parseDataStep(`-- carries Header.Name\n${UPDATE}`)).toThrow(/target/);
    });

    it('refuses an unclosed quote', () => {
      expect(() => parseDataStep("UPDATE t SET a = 'x;")).toThrow(DataStepError);
    });
  });

  describe('undeclaredDestructiveChanges', () => {
    const destructiveChanges: DestructiveChange[] = [
      { target: 'header.name', description: 'Drop column header.name' },
      { target: 'header.nav_label', description: 'Drop column header.nav_label' },
    ];

    it('lists only the changes the data step does not declare', () => {
      const step = parseDataStep(`-- carries header.name\n${UPDATE}`);
      expect(undeclaredDestructiveChanges({ destructiveChanges }, step)).toEqual([
        destructiveChanges[1],
      ]);
    });
  });
});
