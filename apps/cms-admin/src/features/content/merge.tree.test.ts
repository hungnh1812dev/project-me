import { MASKED_FIELDS_KEY } from './content.constants';
import {
  conflictDetails,
  UID_A,
  UID_B,
  UID_C,
} from '../../../test/merge.fixture';
import {
  INITIAL_MERGE_STATE,
  maskedPathsOf,
  mergeReducer,
  type MergeState,
  visibleEntries,
} from './merge.reducer';
import { buildResolvedTree, isEmptyTree } from './merge.tree';

function build(state: MergeState = INITIAL_MERGE_STATE) {
  const details = conflictDetails();
  const masked = maskedPathsOf(details, new Set());
  return buildResolvedTree(
    details,
    visibleEntries(details, masked),
    state,
    masked,
  );
}

const choose = (path: string, side: 'server' | 'client') =>
  mergeReducer(INITIAL_MERGE_STATE, { type: 'choose', path, side });

describe('buildResolvedTree', () => {
  it('keeping every client change sends them, never the masked field', () => {
    const tree = build();
    expect(tree.values).toEqual({ position: 'Engineer' });
    expect(JSON.stringify(tree)).not.toContain('Initech');
    expect(JSON.stringify(tree)).not.toContain('company');
    expect(tree.components?.skill).toEqual([
      { componentUid: UID_A, values: { level: 'Lead' } },
      { componentUid: UID_C },
      { values: { skill: 'Zig', level: 'Junior' } },
    ]);
  });

  it('choosing the saved side leaves that value out of the body', () => {
    const tree = build(choose('values.position', 'server'));
    expect(tree.values).toBeUndefined();
    expect(tree.components?.skill).toBeDefined();
  });

  it('choosing the saved side for a removal keeps the item', () => {
    const tree = build(choose(`components.skill[${UID_B}]`, 'server'));
    expect(tree.components?.skill?.map((i) => i.componentUid)).toEqual([
      UID_A,
      UID_B,
      UID_C,
      undefined,
    ]);
  });

  it('choosing the saved side for an added item drops it', () => {
    const tree = build(choose('components.skill[new#2]', 'server'));
    expect(tree.components?.skill).toEqual([
      { componentUid: UID_A, values: { level: 'Lead' } },
      { componentUid: UID_C },
    ]);
  });

  it('is empty when everything is the saved side', () => {
    const details = conflictDetails();
    const masked = maskedPathsOf(details, new Set());
    const entries = visibleEntries(details, masked);
    const state = mergeReducer(INITIAL_MERGE_STATE, {
      type: 'choose-all',
      paths: entries.map((entry) => entry.path),
      side: 'server',
    });
    expect(isEmptyTree(build(state))).toBe(true);
  });

  it('applies a client reorder', () => {
    const details = conflictDetails();
    details.submitted.components.skill = [
      details.server.components.skill![2]!,
      details.server.components.skill![0]!,
      details.server.components.skill![1]!,
    ];
    details.diff = [
      {
        path: 'components.skill',
        change: 'moved',
        server: [UID_A, UID_B, UID_C],
        submitted: [UID_C, UID_A, UID_B],
      },
    ];
    const masked = maskedPathsOf(details, new Set());
    const entries = visibleEntries(details, masked);
    const client = buildResolvedTree(
      details,
      entries,
      INITIAL_MERGE_STATE,
      masked,
    );
    expect(client.components?.skill?.map((i) => i.componentUid)).toEqual([
      UID_C,
      UID_A,
      UID_B,
    ]);
    const server = buildResolvedTree(
      details,
      entries,
      choose('components.skill', 'server'),
      masked,
    );
    expect(server.components).toBeUndefined();
  });

  it('never sends a masked sub-field of a new item', () => {
    const details = conflictDetails();
    details.server[MASKED_FIELDS_KEY] = ['skill.level'];
    const masked = maskedPathsOf(details, new Set());
    const tree = buildResolvedTree(
      details,
      visibleEntries(details, masked),
      INITIAL_MERGE_STATE,
      masked,
    );
    expect(JSON.stringify(tree)).not.toContain('level');
  });
});
