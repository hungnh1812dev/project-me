import { MEDIA_PURGE_GRACE_MS, PRESET_MEDIA_PROVIDER } from '../domain/Media.constants';
import type {
  MediaReferenceChecker,
  MediaRepository,
  MediaStorage,
  PurgeCandidate,
  StoredMediaProvider,
} from './Media.port';
import { PurgeDeletedMediaService } from './PurgeDeletedMedia.service';

const NOW_MS = 1_800_000_000_000;

function setup(
  rows: PurgeCandidate[],
  referencedIds: number[] = [],
  activeProvider: StoredMediaProvider = 'cloudinary',
) {
  const deleteRow = jest.fn(() => Promise.resolve());
  const findPurgeBatch = jest.fn((_cutoff: Date, afterId: number) =>
    Promise.resolve(rows.filter((row) => row.id > afterId)),
  );
  const repository = {
    findPurgeBatch,
    deleteRow,
  } as unknown as MediaRepository;
  const references: MediaReferenceChecker = {
    isReferenced: (id) => Promise.resolve(referencedIds.includes(id)),
  };
  const deleteObject = jest.fn(() => Promise.resolve());
  const storage = { provider: activeProvider, delete: deleteObject } as unknown as MediaStorage;
  const clock = { now: () => NOW_MS };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new PurgeDeletedMediaService(repository, references, storage, clock, logger);
  return { service, findPurgeBatch, deleteRow, deleteObject, logger };
}

const row = (
  id: number,
  mimeType = 'image/png',
  provider: string = 'cloudinary',
): PurgeCandidate => ({
  id,
  storageKey: `key-${id}`,
  mimeType,
  provider,
});

describe('PurgeDeletedMediaService.run', () => {
  it('asks for rows deleted before the grace period', async () => {
    const { service, findPurgeBatch } = setup([]);
    await service.run();
    expect(findPurgeBatch).toHaveBeenCalledWith(
      new Date(NOW_MS - MEDIA_PURGE_GRACE_MS),
      0,
      expect.any(Number),
    );
  });

  it('deletes the object first, then the row', async () => {
    const { service, deleteObject, deleteRow } = setup([row(1)]);
    expect(await service.run()).toEqual({ purged: 1, skipped: 0 });
    expect(deleteObject).toHaveBeenCalledWith('key-1', 'image');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('removes a preset row without a storage delete and still deletes a stored one', async () => {
    const { service, deleteObject, deleteRow } = setup([
      row(1, 'image/png', PRESET_MEDIA_PROVIDER),
      row(2),
    ]);
    expect(await service.run()).toEqual({ purged: 2, skipped: 0 });
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith('key-2', 'image');
    expect(deleteRow).toHaveBeenCalledWith(1);
    expect(deleteRow).toHaveBeenCalledWith(2);
  });

  it('keeps a preset row that a document points at', async () => {
    const { service, deleteRow } = setup([row(1, 'image/png', PRESET_MEDIA_PROVIDER)], [1]);
    expect(await service.run()).toEqual({ purged: 0, skipped: 1 });
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('keeps a file a document points at again and a row of unknown type', async () => {
    const { service, deleteObject, deleteRow, logger } = setup(
      [row(1), row(2, 'application/x-unknown')],
      [1],
    );
    expect(await service.run()).toEqual({ purged: 0, skipped: 2 });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('keeps the row when the object cannot be removed and goes on', async () => {
    const { service, deleteObject, deleteRow } = setup([row(1), row(2)]);
    deleteObject.mockRejectedValueOnce(new Error('storage down'));
    expect(await service.run()).toEqual({ purged: 1, skipped: 1 });
    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(deleteRow).toHaveBeenCalledWith(2);
  });

  it('keeps and warns about a row of another provider, without a storage delete', async () => {
    const { service, deleteObject, deleteRow, logger } = setup([row(1, 'image/png')], [], 'local');
    expect(await service.run()).toEqual({ purged: 0, skipped: 1 });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message] = logger.warn.mock.calls[0] as unknown as [string];
    expect(message).toContain('1');
    expect(message).toContain('cloudinary');
    expect(message).not.toContain('key-1');
  });

  it('purges a row of the active provider', async () => {
    const { service, deleteObject, deleteRow } = setup([row(1, 'image/png', 'local')], [], 'local');
    expect(await service.run()).toEqual({ purged: 1, skipped: 0 });
    expect(deleteObject).toHaveBeenCalledWith('key-1', 'image');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });
});
