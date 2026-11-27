import { rekeyOpenItems } from './ItemOpenState.context';

const draft = {
  experience: [{ __uid: 'u1' }, { __uid: 'u2', skills: [{ __uid: 's1' }, { __uid: '' }] }],
};

describe('rekeyOpenItems', () => {
  it('replaces a client key with the uid at the same position', () => {
    const next = rekeyOpenItems(new Set(['c1', 'u1']), new Map([['c1', 'experience.1']]), draft);
    expect([...next].sort()).toEqual(['u1', 'u2']);
  });

  it('follows a nested position', () => {
    const next = rekeyOpenItems(new Set(['c1']), new Map([['c1', 'experience.1.skills.0']]), draft);
    expect([...next]).toEqual(['s1']);
  });

  it('closes an item not found in the draft or without a uid', () => {
    const paths = new Map([
      ['c1', 'experience.5'],
      ['c2', 'experience.1.skills.1'],
    ]);
    expect(rekeyOpenItems(new Set(['c1', 'c2']), paths, draft).size).toBe(0);
  });

  it('ignores a tracked item that is closed', () => {
    const next = rekeyOpenItems(new Set(), new Map([['c1', 'experience.0']]), draft);
    expect(next.size).toBe(0);
  });
});
