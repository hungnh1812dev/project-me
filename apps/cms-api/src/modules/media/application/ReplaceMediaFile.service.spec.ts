import { Readable } from 'node:stream';

import { systemRole } from '../../../../test/fixtures/Access.fixture';
import { Clock } from '../../../common/time/Clock.service';
import type { TransactionRunner } from '../../../infrastructure/database/TransactionRunner.port';
import type { AccountActor } from '../../access';
import { AUDIT_ACTIONS, type SecurityAuditService } from '../../security-audit';
import { FakeMediaStorage } from '../adapters/Fake.adapter';
import type {
  MediaRepository,
  PreparedUpload,
  ReceivedUpload,
  UploadProcessor,
  UploadStream,
} from './Media.port';
import type { MediaLibraryService } from './MediaLibrary.service';
import { ReplaceMediaFileService } from './ReplaceMediaFile.service';

const actor: AccountActor = { kind: 'account', accountId: 5, role: systemRole('editor') };
const meta = { ip: '1.2.3.4' } as never;

class LocalProviderStorage extends FakeMediaStorage {
  override readonly provider = 'local';
}

function stubs(
  options: {
    newMime?: 'image/png' | 'application/pdf';
    replaceError?: Error;
    storage?: FakeMediaStorage;
  } = {},
) {
  const newMime = options.newMime ?? 'image/png';
  const dispose = jest.fn(() => Promise.resolve());
  const received = { fileName: 'new.png', alt: null, dispose } as unknown as ReceivedUpload;
  const prepared: PreparedUpload = {
    fileName: 'new_bbbbbbbb.png',
    mimeType: newMime,
    kind: newMime === 'image/png' ? 'image' : 'pdf',
    size: 3,
    sha256: 'b'.repeat(64),
    width: 1,
    height: 1,
    open: () => Readable.from([Buffer.from('abc')]),
  };
  const receive = jest.fn(() => Promise.resolve(received));
  const processor = {
    receive,
    prepare: jest.fn(() => Promise.resolve(prepared)),
  } as unknown as UploadProcessor;
  const record = { documentId: 'doc', alt: 'keep' };
  const replaceFile = jest.fn(() =>
    options.replaceError === undefined
      ? Promise.resolve({ record, previousSha256: 'a'.repeat(64) })
      : Promise.reject(options.replaceError),
  );
  const lockLive = jest.fn(() => Promise.resolve(true));
  const findLiveTarget = jest.fn((): Promise<{ id: number; mimeType: string } | undefined> =>
    Promise.resolve({ id: 9, mimeType: 'image/jpeg' }),
  );
  const repository = { findLiveTarget, lockLive, replaceFile } as unknown as MediaRepository;
  const runner = {
    run: (work: (unit: unknown) => Promise<unknown>) => work({}),
  } as unknown as TransactionRunner;
  const library = { rowConditionOf: jest.fn(() => Promise.resolve(null)) };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const storage = options.storage ?? new FakeMediaStorage();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new ReplaceMediaFileService(
    processor,
    repository,
    storage,
    runner,
    logger,
    library as unknown as MediaLibraryService,
    audit as unknown as SecurityAuditService,
    new Clock(),
  );
  return { service, storage, receive, replaceFile, findLiveTarget, audit, dispose, lockLive };
}

describe('ReplaceMediaFileService.replace', () => {
  const upload = {} as UploadStream;

  it('passes the provider of the storage that stored the new file', async () => {
    const { service, replaceFile } = stubs({ storage: new LocalProviderStorage() });
    await service.replace(actor, 'doc', {} as UploadStream, meta);
    const [call] = replaceFile.mock.calls as unknown as [[unknown, { file: { provider: string } }]];
    expect(call[1].file.provider).toBe('local');
  });

  it('swaps the row, audits old and new hashes and removes the temp file', async () => {
    const { service, storage, receive, replaceFile, audit, dispose } = stubs();
    const result = await service.replace(actor, 'doc', upload, meta);
    expect(result.documentId).toBe('doc');
    expect(receive).toHaveBeenCalledWith(upload, { acceptsAlt: false });
    expect(storage.keys()).toHaveLength(1);
    const [call] = replaceFile.mock.calls as unknown as [[unknown, Record<string, unknown>]];
    expect(call[1]).toMatchObject({
      mediaId: 9,
      updatedById: 5,
      file: {
        fileName: 'new_bbbbbbbb.png',
        storageKey: storage.keys()[0],
        sha256: 'b'.repeat(64),
        provider: storage.provider,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: AUDIT_ACTIONS.MEDIA_REPLACED,
        targetId: 'doc',
        metadata: { previousSha256: 'a'.repeat(64), sha256: 'b'.repeat(64) },
      }),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('answers 404 before reading the body when the file is unknown', async () => {
    const { service, receive, findLiveTarget } = stubs();
    findLiveTarget.mockResolvedValueOnce(undefined);
    await expect(service.replace(actor, 'doc', upload, meta)).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(receive).not.toHaveBeenCalled();
  });

  it('rejects another family and stores nothing', async () => {
    const { service, storage, replaceFile, dispose } = stubs({ newMime: 'application/pdf' });
    await expect(service.replace(actor, 'doc', upload, meta)).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    expect(storage.keys()).toEqual([]);
    expect(replaceFile).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the new object and leaves the row when the swap fails', async () => {
    const { service, storage, dispose } = stubs({ replaceError: new Error('db down') });
    await expect(service.replace(actor, 'doc', upload, meta)).rejects.toThrow('db down');
    expect(storage.keys()).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('answers 404 when the row was deleted before the lock', async () => {
    const { service, storage, lockLive } = stubs();
    lockLive.mockResolvedValueOnce(false);
    await expect(service.replace(actor, 'doc', upload, meta)).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(storage.keys()).toEqual([]);
  });
});
