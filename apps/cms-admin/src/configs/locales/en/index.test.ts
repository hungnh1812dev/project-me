import { describe, expect, it } from 'vitest';

import { EN_TEXT } from '.';
import snapshot from './copy.snapshot.json';
import { toComparableCopy } from './CopySnapshot.fixture';

type CopySnapshot = Record<string, unknown>;
const comparableCopy = toComparableCopy(EN_TEXT) as CopySnapshot;
const snapshotBeforeSplit = snapshot as CopySnapshot;

describe('EN_TEXT aggregate', () => {
  it.each(['login', 'setup', 'password', 'security'])(
    'keeps the %s section identical to the single-file copy',
    (section) => {
      expect(comparableCopy[section]).toEqual(snapshotBeforeSplit[section]);
    },
  );

  it('keeps every other section identical too', () => {
    expect(comparableCopy).toEqual(snapshotBeforeSplit);
  });
});
