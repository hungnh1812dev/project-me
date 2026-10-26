import { Readable } from 'node:stream';

import { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FakeMediaStorage } from '../../../infrastructure/media/fake.adapter';
import { systemRole } from '../../../../test/fixtures/access.fixture';
import type { AccountActor } from '../../access';
import type {
  PreparedUpload,
  ReceivedUpload,
  UploadProcessor,
  UploadStream,
} from './Media.port';
import { UploadMediaService } from './UploadMedia.service';

const actor: AccountActor = {
  kind: 'account',
  accountId: 5,
  role: systemRole('editor'),
};

function stubs(createError?: Error) {
  const dispose = jest.fn(() => Promise.resolve());
  const received = {
    fileName: 'a.png',
    alt: null,
    dispose,
  } as unknown as ReceivedUpload;
  const prepared: PreparedUpload = {
    mimeType: 'image/png',
    kind: 'image',
    size: 3,
    sha256: 'f'.repeat(64),
    width: 1,
    height: 1,
    open: () => Readable.from([Buffer.from('abc')]),
  };
  const processor = {
    receive: jest.fn(() => Promise.resolve(received)),
    prepare: jest.fn(() => Promise.resolve(prepared)),
  } as unknown as UploadProcessor;
  const create = jest.fn(() =>
    createError === undefined
      ? Promise.resolve({
          documentId: 'doc',
          fileName: 'a.png',
          mimeType: 'image/png',
          size: 3,
          width: 1,
          height: 1,
          alt: null,
          url: 'u',
          thumbnailUrl: 't',
          isReviewerPreset: false,
          createdAt: new Date(0),
        })
      : Promise.reject(createError),
  );
  const prisma = { fileLibrary: { create } } as unknown as PrismaService;
  const storage = new FakeMediaStorage();
  const logger = { warn: jest.fn(), error: jest.fn() };
  const service = new UploadMediaService(
    processor,
    prisma,
    new Clock(),
    storage,
    logger,
  );
  return { service, storage, create, dispose };
}

describe('UploadMediaService.upload', () => {
  const upload = {} as UploadStream;

  it('stores under a UUIDv7 key, records the row and removes the temp file', async () => {
    const { service, storage, create, dispose } = stubs();
    const view = await service.upload(actor, upload);
    expect(view.documentId).toBe('doc');
    expect(storage.keys()).toHaveLength(1);
    const [call] = create.mock.calls as unknown as [
      [{ data: Record<string, unknown> }],
    ];
    expect(call[0].data).toMatchObject({
      storageKey: storage.keys()[0],
      provider: 'cloudinary',
      createdById: 5,
      updatedById: 5,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the stored object when the row cannot be written', async () => {
    const { service, storage, dispose } = stubs(new Error('db down'));
    await expect(service.upload(actor, upload)).rejects.toThrow('db down');
    expect(storage.keys()).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
