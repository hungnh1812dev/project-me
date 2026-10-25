import { RecordSerializer, FieldSelection } from '../../access';
import {
  accountAccess,
  profileType,
  rawRecord,
} from '../../../../test/fixtures/masking.fixture';
import { diffRecords, overlaySubmitted } from './Diff.rules';

const type = profileType();
const serializer = new RecordSerializer(type);
const { record } = rawRecord(type, 2);
const all = accountAccess(FieldSelection.ALL);

function diffFor(
  tree: Parameters<typeof overlaySubmitted>[1],
  access = all,
  stored = record,
) {
  return diffRecords(
    serializer.serialize(stored, access),
    serializer.serialize(overlaySubmitted(stored, tree), access),
  );
}

describe('document diff (T21)', () => {
  it('is empty when nothing differs', () => {
    expect(diffFor({})).toEqual([]);
  });

  it('reports a changed value with both sides', () => {
    expect(diffFor({ values: { name: 'New name' } })).toEqual([
      {
        path: 'values.name',
        change: 'changed',
        server: record.values.name,
        submitted: 'New name',
      },
    ]);
  });

  it('treats 1.5 and "1.50" as the same decimal', () => {
    const stored = { ...record, values: { ...record.values, salary: '1.50' } };
    expect(diffFor({ values: { salary: 1.5 } }, all, stored)).toEqual([]);
  });

  it('matches components by uid: changed, removed, added and moved', () => {
    const [first, second] = record.components.experience ?? [];
    if (first === undefined || second === undefined) throw new Error('fixture');
    const entries = diffFor({
      components: {
        experience: [
          { values: { company: 'Brand new' } },
          { componentUid: second.componentUid, values: { years: 77 } },
        ],
      },
    });
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    expect(byPath.get(`components.experience[${first.componentUid}]`)).toEqual(
      expect.objectContaining({ change: 'removed' }),
    );
    expect(byPath.get('components.experience[new#0]')).toEqual(
      expect.objectContaining({ change: 'added' }),
    );
    expect(
      byPath.get(`components.experience[${second.componentUid}].values.years`),
    ).toEqual(expect.objectContaining({ change: 'changed', submitted: 77 }));
  });

  it('reports a reorder of kept items', () => {
    const [first, second] = record.components.experience ?? [];
    if (first === undefined || second === undefined) throw new Error('fixture');
    const entries = diffFor({
      components: {
        experience: [
          { componentUid: second.componentUid },
          { componentUid: first.componentUid },
        ],
      },
    });
    expect(entries.map((entry) => entry.change)).toContain('moved');
  });

  it('never shows an unreadable field: same mask on both sides', () => {
    const access = accountAccess(FieldSelection.of(['name']));
    const entries = diffFor(
      { values: { name: 'Visible', salary: '123.00', bio: 'x' } },
      access,
    );
    expect(entries.map((entry) => entry.path)).toEqual(['values.name']);
    expect(JSON.stringify(entries)).not.toContain('123.00');
  });
});
