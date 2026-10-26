import { describe, expect, it } from 'vitest';
import { COPY } from '.';
import { toComparableCopy } from './CopySnapshot.fixture';
import snapshot from './copy.snapshot.json';

type CopySnapshot = Record<string, unknown>;
const comparableCopy = toComparableCopy(COPY) as CopySnapshot;
const snapshotBeforeSplit = snapshot as CopySnapshot;

describe('COPY aggregate', () => {
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
