import { Readable } from 'node:stream';

import {
  CloudinaryMediaStorage,
  cloudinaryUploadOptions,
  type CloudinaryClient,
} from './Cloudinary.adapter';
import { FAKE_STORAGE_ORIGIN, FakeMediaStorage } from './Fake.adapter';

const KEY = '01900000-0000-7000-8000-000000000001';

describe('FakeMediaStorage', () => {
  it('keeps the bytes under the key and returns urls', async () => {
    const storage = new FakeMediaStorage();
    const stored = await storage.put({
      key: KEY,
      kind: 'image',
      mimeType: 'image/png',
      body: Readable.from([Buffer.from('ab'), Buffer.from('cd')]),
    });
    expect(storage.get(KEY)?.bytes.toString()).toBe('abcd');
    expect(stored.url).toBe(`${FAKE_STORAGE_ORIGIN}/${KEY}`);
    expect(stored.thumbnailUrl).toContain(KEY);
  });

  it('has no thumbnail for pdf and video, and deletes idempotently', async () => {
    const storage = new FakeMediaStorage();
    const stored = await storage.put({
      key: KEY,
      kind: 'pdf',
      mimeType: 'application/pdf',
      body: Readable.from([Buffer.from('x')]),
    });
    expect(stored.thumbnailUrl).toBeNull();
    expect(storage.keys()).toEqual([KEY]);
    await storage.delete(KEY);
    await storage.delete(KEY);
    expect(storage.keys()).toEqual([]);
  });
});

describe('CloudinaryMediaStorage', () => {
  function stubClient() {
    const calls: unknown[][] = [];
    const client: CloudinaryClient = {
      uploadStream: (publicId, resourceType) => {
        calls.push(['upload', publicId, resourceType]);
        return Promise.resolve({ secureUrl: `https://cdn.test/${publicId}` });
      },
      destroy: (publicId, resourceType) => {
        calls.push(['destroy', publicId, resourceType]);
        return Promise.resolve();
      },
      thumbnailUrl: (publicId) => `https://cdn.test/t/${publicId}`,
    };
    return { client, calls };
  }
  const body = () => Readable.from([Buffer.from('x')]);

  it('stores images under folder/key with a thumbnail', async () => {
    const { client, calls } = stubClient();
    const stored = await new CloudinaryMediaStorage(client, 'abyss').put({
      key: KEY,
      kind: 'image',
      mimeType: 'image/png',
      body: body(),
    });
    expect(calls).toEqual([['upload', `abyss/${KEY}`, 'image']]);
    expect(stored).toEqual({
      url: `https://cdn.test/abyss/${KEY}`,
      thumbnailUrl: `https://cdn.test/t/abyss/${KEY}`,
    });
  });

  it('stores pdf as raw with the extension and video as video, no thumbnail', async () => {
    const { client, calls } = stubClient();
    const storage = new CloudinaryMediaStorage(client, undefined);
    const pdf = await storage.put({
      key: KEY,
      kind: 'pdf',
      mimeType: 'application/pdf',
      body: body(),
    });
    await storage.put({
      key: KEY,
      kind: 'video',
      mimeType: 'video/mp4',
      body: body(),
    });
    expect(pdf.thumbnailUrl).toBeNull();
    expect(calls).toEqual([
      ['upload', `${KEY}.pdf`, 'raw'],
      ['upload', KEY, 'video'],
    ]);
  });

  it('deletes with the same public id', async () => {
    const { client, calls } = stubClient();
    await new CloudinaryMediaStorage(client, 'abyss').delete(KEY, 'pdf');
    expect(calls).toEqual([['destroy', `abyss/${KEY}.pdf`, 'raw']]);
  });
});

describe('cloudinaryUploadOptions', () => {
  it('pins the id and forbids overwrite and name guessing', () => {
    expect(cloudinaryUploadOptions('folder/abc', 'raw')).toEqual({
      public_id: 'folder/abc',
      resource_type: 'raw',
      type: 'upload',
      overwrite: false,
      use_filename: false,
      unique_filename: false,
    });
  });
});
