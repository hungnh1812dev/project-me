import { DomainError } from '../../../common/errors/Domain.errors';
import type { AccountActor } from '../../access';
import type { ReauthenticationService } from '../../identity';
import {
  AUDIT_ACTIONS,
  REAUTH_PURPOSES,
  type SecurityAuditService,
  selfActor,
} from '../../security-audit';
import {
  BACKUPS_ERROR_CODES,
  DOWNLOAD_LINK_TTL_SECONDS,
} from '../domain/Backups.constants';
import {
  BackupStorageError,
  type BackupStorage,
  type StoredBackupObject,
} from './Backups.port';
import { BackupsService, type BackupsCaller } from './Backups.service';

const PREFIX = 'postgres/';
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const KEY = `${PREFIX}daily/abyss-20261027T020000Z.dump.age`;
const FILE_NAME = 'abyss-20261027T020000Z.dump.age';
const META = { userAgent: undefined, ip: '203.0.113.9' };
const INPUT = { key: KEY, password: 'pw', code: '123456' };
const CALLER: BackupsCaller = {
  actor: { kind: 'account', accountId: 7 } as AccountActor,
  accountDocumentId: 'doc-7',
};
const URL = 'https://bucket.example.test/signed';

function setup(
  options: { objects?: StoredBackupObject[]; isOn?: boolean } = {},
) {
  const calls: string[] = [];
  const objects = options.objects ?? [];
  const find = jest.fn((key: string) => {
    calls.push('find');
    return Promise.resolve(objects.find((o) => o.key === key) ?? null);
  });
  const createDownloadUrl = jest.fn((_key: string, _ttl: number) => {
    calls.push('url');
    return Promise.resolve(URL);
  });
  const list = jest.fn((prefix: string) =>
    Promise.resolve(objects.filter((o) => o.key.startsWith(prefix))),
  );
  const storage: BackupStorage = { list, find, createDownloadUrl };
  const confirm = jest.fn((..._args: unknown[]) => {
    calls.push('confirm');
    return Promise.resolve();
  });
  const recordStandalone = jest.fn((..._args: unknown[]) => {
    calls.push('audit');
    return Promise.resolve();
  });
  const isOn = options.isOn ?? true;
  const service = new BackupsService(
    isOn ? storage : null,
    isOn ? PREFIX : null,
    { confirm } as unknown as ReauthenticationService,
    { recordStandalone } as unknown as SecurityAuditService,
    { now: () => NOW },
  );
  return {
    service,
    list,
    find,
    createDownloadUrl,
    confirm,
    recordStandalone,
    calls,
  };
}

async function refusalOf(call: Promise<unknown>): Promise<DomainError> {
  const error: unknown = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof DomainError))
    throw new Error('expected a DomainError');
  return error;
}

describe('BackupsService.list', () => {
  it('lists both kinds newest first, skips foreign keys, and summarizes', async () => {
    const { service } = setup({
      objects: [
        { key: `${PREFIX}daily/abyss-20261026T020000Z.dump.age`, sizeBytes: 5 },
        { key: KEY, sizeBytes: 10 },
        {
          key: `${PREFIX}monthly/abyss-20261001T020000Z.dump.age`,
          sizeBytes: 7,
        },
        { key: `${PREFIX}daily/notes.txt`, sizeBytes: 1 },
      ],
    });
    const listing = await service.list();
    expect(listing.data.map((item) => item.fileName)).toEqual([
      FILE_NAME,
      'abyss-20261026T020000Z.dump.age',
      'abyss-20261001T020000Z.dump.age',
    ]);
    expect(listing.meta).toMatchObject({
      count: 3,
      totalBytes: 22,
      isStale: false,
    });
  });

  it('reports an empty bucket as stale', async () => {
    const listing = await setup().service.list();
    expect(listing).toMatchObject({
      data: [],
      meta: { count: 0, latestAt: null, isStale: true },
    });
  });

  it('answers BACKUPS_NOT_CONFIGURED when the feature is off', async () => {
    const error = await refusalOf(setup({ isOn: false }).service.list());
    expect(error.errorCode).toBe(BACKUPS_ERROR_CODES.NOT_CONFIGURED);
  });

  it('turns a bucket failure into a bare 503', async () => {
    const { service, list } = setup();
    list.mockRejectedValue(new BackupStorageError('list', 'Boom'));
    const error = await refusalOf(service.list());
    expect(error.kind).toBe('unavailable');
    expect(error.message).not.toContain('Boom');
  });
});

describe('BackupsService.createDownloadLink', () => {
  const objects = [{ key: KEY, sizeBytes: 42 }];

  it('checks in order: re-auth, find, link, audit', async () => {
    const { service, calls } = setup({ objects });
    await service.createDownloadLink(CALLER, INPUT, META);
    expect(calls).toEqual(['confirm', 'find', 'url', 'audit']);
  });

  it('re-authenticates with the account document id and the backup purpose', async () => {
    const { service, confirm } = setup({ objects });
    await service.createDownloadLink(CALLER, INPUT, META);
    expect(confirm).toHaveBeenCalledWith(
      'doc-7',
      { password: 'pw', code: '123456' },
      REAUTH_PURPOSES.BACKUP_DOWNLOAD,
      META,
    );
  });

  it('signs for the fixed ttl and returns the url, file name and expiry', async () => {
    const { service, createDownloadUrl } = setup({ objects });
    const view = await service.createDownloadLink(CALLER, INPUT, META);
    expect(createDownloadUrl).toHaveBeenCalledWith(
      KEY,
      DOWNLOAD_LINK_TTL_SECONDS,
    );
    expect(view).toEqual({
      url: URL,
      fileName: FILE_NAME,
      expiresAt: new Date(NOW + DOWNLOAD_LINK_TTL_SECONDS * 1000).toISOString(),
    });
  });

  it('audits the file name, kind and size, never the url', async () => {
    const { service, recordStandalone } = setup({ objects });
    await service.createDownloadLink(CALLER, INPUT, META);
    expect(recordStandalone).toHaveBeenCalledWith({
      actor: selfActor(7),
      action: AUDIT_ACTIONS.BACKUP_DOWNLOAD_LINK_CREATED,
      targetId: FILE_NAME,
      metadata: { kind: 'daily', sizeBytes: 42 },
      ip: META.ip,
    });
    expect(JSON.stringify(recordStandalone.mock.calls)).not.toContain(URL);
  });

  it.each([
    ['outside the prefix', 'other/daily/abyss-20261027T020000Z.dump.age'],
    ['with a parent segment', `${PREFIX}daily/../x`],
    ['not a dump name', `${PREFIX}daily/readme.txt`],
  ])(
    'refuses a key %s with 400 before any re-auth or bucket call',
    async (_n, key) => {
      const { service, confirm, find, recordStandalone } = setup({ objects });
      const error = await refusalOf(
        service.createDownloadLink(CALLER, { ...INPUT, key }, META),
      );
      expect(error.kind).toBe('invalid_input');
      expect(confirm).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      expect(recordStandalone).not.toHaveBeenCalled();
    },
  );

  it('makes no bucket call and writes no audit row when re-auth fails', async () => {
    const { service, confirm, find, createDownloadUrl, recordStandalone } =
      setup({ objects });
    confirm.mockRejectedValue(new DomainError({ kind: 'forbidden' }));
    await refusalOf(service.createDownloadLink(CALLER, INPUT, META));
    expect(find).not.toHaveBeenCalled();
    expect(createDownloadUrl).not.toHaveBeenCalled();
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it('answers BACKUP_NOT_FOUND for a missing object, with no link or audit row', async () => {
    const { service, createDownloadUrl, recordStandalone } = setup({
      objects: [],
    });
    const error = await refusalOf(
      service.createDownloadLink(CALLER, INPUT, META),
    );
    expect(error.errorCode).toBe(BACKUPS_ERROR_CODES.NOT_FOUND);
    expect(createDownloadUrl).not.toHaveBeenCalled();
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it('gives no link when the audit row cannot be written', async () => {
    const { service, recordStandalone } = setup({ objects });
    recordStandalone.mockRejectedValue(new Error('db down'));
    await expect(
      service.createDownloadLink(CALLER, INPUT, META),
    ).rejects.toThrow('db down');
  });

  it('answers BACKUPS_NOT_CONFIGURED when the feature is off', async () => {
    const { service, confirm } = setup({ isOn: false });
    const error = await refusalOf(
      service.createDownloadLink(CALLER, INPUT, META),
    );
    expect(error.errorCode).toBe(BACKUPS_ERROR_CODES.NOT_CONFIGURED);
    expect(confirm).not.toHaveBeenCalled();
  });
});
