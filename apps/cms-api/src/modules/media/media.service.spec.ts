import { Readable } from 'node:stream';

import { FakeMediaStorage } from '../../infrastructure/media/fake.adapter';
import { type AccountActor, type AccessPolicyService } from '../access';
import { systemRole } from '../../../test/fixtures/access.fixture';
import type { ContentDbProvider } from '../content-engine';
import { MediaService } from './media.service';
import type {
  PreparedUpload,
  ReceivedUpload,
  UploadPipeline,
} from './upload.pipeline';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { IncomingMessage } from 'node:http';

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
  const pipeline = {
    receive: jest.fn(() => Promise.resolve(received)),
    prepare: jest.fn(() => Promise.resolve(prepared)),
  } as unknown as UploadPipeline;
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
  const service = new MediaService(
    pipeline,
    prisma,
    {} as ContentDbProvider,
    {} as AccessPolicyService,
    storage,
  );
  return { service, storage, create, dispose };
}

describe('MediaService.upload', () => {
  const req = {} as IncomingMessage;

  it('stores under a UUIDv7 key, records the row and removes the temp file', async () => {
    const { service, storage, create, dispose } = stubs();
    const view = await service.upload(actor, req);
    expect(view.id).toBe('doc');
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
    await expect(service.upload(actor, req)).rejects.toThrow('db down');
    expect(storage.keys()).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
