import { MS_PER_HOUR } from '../../../common/constants/Time.constants';
import {
  parseBackupKey,
  sortNewestFirst,
  summarizeBackups,
  type BackupEntry,
} from './BackupCatalog.rules';
import { STALE_AFTER_HOURS } from './Backups.constants';

const PREFIX = 'postgres/';
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

function entry(
  kind: 'daily' | 'monthly',
  hoursAgo: number,
  sizeBytes = 100,
): BackupEntry & { sizeBytes: number } {
  const createdAt = new Date(NOW - hoursAgo * MS_PER_HOUR);
  return {
    key: `${PREFIX}${kind}/x`,
    kind,
    fileName: 'x',
    createdAt,
    sizeBytes,
  };
}

describe('parseBackupKey', () => {
  it('parses a daily key and reads the UTC time from the file name', () => {
    expect(
      parseBackupKey(`${PREFIX}daily/abyss-20261027T020304Z.dump.age`, PREFIX),
    ).toEqual({
      key: `${PREFIX}daily/abyss-20261027T020304Z.dump.age`,
      kind: 'daily',
      fileName: 'abyss-20261027T020304Z.dump.age',
      createdAt: new Date('2026-10-27T02:03:04.000Z'),
    });
  });

  it('parses a monthly key', () => {
    expect(
      parseBackupKey(`${PREFIX}monthly/abyss-20261001T020304Z.dump.age`, PREFIX)
        ?.kind,
    ).toBe('monthly');
  });

  it.each([
    ['a key outside the prefix', 'other/daily/abyss-20261027T020304Z.dump.age'],
    ['an unknown kind', `${PREFIX}weekly/abyss-20261027T020304Z.dump.age`],
    ['no kind folder', `${PREFIX}abyss-20261027T020304Z.dump.age`],
    ['a deeper folder', `${PREFIX}daily/a/abyss-20261027T020304Z.dump.age`],
    ['a parent segment', `${PREFIX}daily/../abyss-20261027T020304Z.dump.age`],
    ['a bad extension', `${PREFIX}daily/abyss-20261027T020304Z.dump`],
    ['a short stamp', `${PREFIX}daily/abyss-2026102T020304Z.dump.age`],
    ['month 13', `${PREFIX}daily/abyss-20261327T020304Z.dump.age`],
    [
      'day 31 of a 30-day month',
      `${PREFIX}daily/abyss-20261131T020304Z.dump.age`,
    ],
    ['hour 25', `${PREFIX}daily/abyss-20261027T250304Z.dump.age`],
    ['an empty key', ''],
  ])('returns null for %s', (_name, key) => {
    expect(parseBackupKey(key, PREFIX)).toBeNull();
  });
});

describe('sortNewestFirst', () => {
  it('orders by createdAt descending without changing the input', () => {
    const entries = [entry('daily', 30), entry('daily', 2), entry('daily', 10)];
    const sorted = sortNewestFirst(entries);
    expect(sorted.map((e) => e.createdAt.getTime())).toEqual([
      NOW - 2 * MS_PER_HOUR,
      NOW - 10 * MS_PER_HOUR,
      NOW - 30 * MS_PER_HOUR,
    ]);
    expect(entries[0]?.createdAt.getTime()).toBe(NOW - 30 * MS_PER_HOUR);
  });
});

describe('summarizeBackups', () => {
  it('is stale and empty for an empty list', () => {
    expect(summarizeBackups([], NOW)).toEqual({
      count: 0,
      totalBytes: 0,
      latestAt: null,
      isStale: true,
    });
  });

  it('is fresh with a daily dump inside the limit, and sums the sizes', () => {
    const summary = summarizeBackups(
      [entry('daily', 3, 10), entry('monthly', 100, 5)],
      NOW,
    );
    expect(summary.isStale).toBe(false);
    expect(summary.count).toBe(2);
    expect(summary.totalBytes).toBe(15);
    expect(summary.latestAt).toEqual(new Date(NOW - 3 * MS_PER_HOUR));
  });

  it('is stale when the newest daily dump is older than the limit', () => {
    expect(
      summarizeBackups([entry('daily', STALE_AFTER_HOURS + 1)], NOW).isStale,
    ).toBe(true);
  });

  it('is fresh exactly at the limit', () => {
    expect(
      summarizeBackups([entry('daily', STALE_AFTER_HOURS)], NOW).isStale,
    ).toBe(false);
  });

  it('does not count a fresh monthly dump as a nightly one', () => {
    const summary = summarizeBackups([entry('monthly', 1)], NOW);
    expect(summary.isStale).toBe(true);
    expect(summary.latestAt).toEqual(new Date(NOW - MS_PER_HOUR));
  });
});
