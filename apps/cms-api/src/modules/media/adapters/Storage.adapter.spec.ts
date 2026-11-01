import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  CloudinaryMediaStorage,
  cloudinaryUploadOptions,
  type CloudinaryClient,
} from './Cloudinary.adapter';
import { FAKE_STORAGE_ORIGIN, FakeMediaStorage } from './Fake.adapter';
import { LocalMediaStorage } from './Local.adapter';

const KEY = '01900000-0000-7000-8000-000000000001';
const KEY_2 = '01900000-0000-7000-8000-000000000002';

describe('delivery origin', () => {
  it('is the origin each adapter delivers from', () => {
    expect(new FakeMediaStorage().deliveryOrigin).toBe(FAKE_STORAGE_ORIGIN);
    expect(new CloudinaryMediaStorage({} as CloudinaryClient, undefined).deliveryOrigin).toBe(
      'https://res.cloudinary.com',
    );
    expect(
      new LocalMediaStorage('/tmp/x', 'http://localhost:8080/api/v1/media-files').deliveryOrigin,
    ).toBe('http://localhost:8080');
  });
});

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

describe('LocalMediaStorage', () => {
  const PUBLIC_URL = 'http://localhost:8080/api/v1/media-files';
  let directory: string;
  let storage: LocalMediaStorage;
  const body = (text = 'bytes') => Readable.from([Buffer.from(text)]);

  async function readAll(file: { stream: Readable } | null): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of file?.stream ?? []) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks).toString();
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'abyss-media-'));
    storage = LocalMediaStorage.open({
      directory,
      publicUrl: PUBLIC_URL,
      allowedInProduction: false,
    });
  });

  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('puts the bytes under <key>.<ext>, returns urls and leaves no temp file', async () => {
    const stored = await storage.put({
      key: KEY,
      kind: 'image',
      mimeType: 'image/png',
      body: body('png-bytes'),
    });
    expect(stored).toEqual({
      url: `${PUBLIC_URL}/${KEY}.png`,
      thumbnailUrl: `${PUBLIC_URL}/${KEY}.png`,
    });
    expect(await readdir(directory)).toEqual([`${KEY}.png`]);
    expect(await readFile(join(directory, `${KEY}.png`), 'utf8')).toBe('png-bytes');
  });

  it('has no thumbnail for pdf and video', async () => {
    const pdf = await storage.put({
      key: KEY,
      kind: 'pdf',
      mimeType: 'application/pdf',
      body: body(),
    });
    expect(pdf).toEqual({ url: `${PUBLIC_URL}/${KEY}.pdf`, thumbnailUrl: null });
  });

  it('leaves no file when the write fails', async () => {
    const failing = new Readable({
      read() {
        this.destroy(new Error('broken upload'));
      },
    });
    await expect(
      storage.put({ key: KEY, kind: 'image', mimeType: 'image/png', body: failing }),
    ).rejects.toThrow('broken upload');
    expect(await readdir(directory)).toEqual([]);
  });

  it.each([
    ['a key that is not a uuidv7', '../x', 'image/png'],
    ['a type outside the allowlist', KEY, 'image/svg+xml'],
  ])('refuses %s', async (_label, key, mimeType) => {
    await expect(storage.put({ key, kind: 'image', mimeType, body: body() })).rejects.toThrow(
      /unusable/,
    );
    expect(await readdir(directory)).toEqual([]);
  });

  it('reads a stored file back with its type and size', async () => {
    await storage.put({ key: KEY, kind: 'image', mimeType: 'image/webp', body: body('webp') });
    const file = await storage.openPublicFile(`${KEY}.webp`);
    expect(file).toMatchObject({ mimeType: 'image/webp', size: 4 });
    expect(await readAll(file)).toBe('webp');
  });

  it('deletes the file of each extension of the kind, and a missing one is fine', async () => {
    await storage.put({ key: KEY, kind: 'image', mimeType: 'image/png', body: body() });
    await storage.put({ key: KEY_2, kind: 'pdf', mimeType: 'application/pdf', body: body() });
    await storage.delete(KEY, 'image');
    await storage.delete(KEY, 'image');
    expect(await readdir(directory)).toEqual([`${KEY_2}.pdf`]);
    await storage.delete(KEY_2, 'image');
    expect(await readdir(directory)).toEqual([`${KEY_2}.pdf`]);
    await storage.delete(KEY_2, 'pdf');
    expect(await readdir(directory)).toEqual([]);
  });

  it('ignores a delete for a key that is not a uuidv7', async () => {
    await writeFile(join(directory, 'keep.png'), 'x');
    await storage.delete('keep', 'image');
    expect(await readdir(directory)).toEqual(['keep.png']);
  });

  it.each([
    '../x',
    'x.png',
    `${KEY}.svg`,
    `${KEY}.png/..`,
    `${KEY}.png/`,
    `${KEY}`,
    `${KEY}.`,
    `${KEY}.PNG`,
    `${KEY}.png.png`,
    `${KEY}.pdf.png`,
    `..%2F${KEY}.png`,
    `${KEY}.png\0`,
    '',
  ])('answers null for the name %j without touching the disk', async (name) => {
    await writeFile(join(directory, 'x.png'), 'x');
    await expect(storage.openPublicFile(name)).resolves.toBeNull();
  });

  it('answers null for a valid name with no file, and for a symlink', async () => {
    await expect(storage.openPublicFile(`${KEY}.png`)).resolves.toBeNull();
    await writeFile(join(directory, 'target'), 'secret');
    await symlink(join(directory, 'target'), join(directory, `${KEY}.png`));
    await expect(storage.openPublicFile(`${KEY}.png`)).resolves.toBeNull();
  });

  it('creates a missing directory and fails the boot when it is not writable', async () => {
    const nested = join(directory, 'a', 'b');
    LocalMediaStorage.open({
      directory: nested,
      publicUrl: PUBLIC_URL,
      allowedInProduction: false,
    });
    expect(await readdir(nested)).toEqual([]);
    const blocker = join(directory, 'file');
    await writeFile(blocker, 'x');
    expect(() =>
      LocalMediaStorage.open({
        directory: join(blocker, 'child'),
        publicUrl: PUBLIC_URL,
        allowedInProduction: false,
      }),
    ).toThrow(/ENOTDIR/);
  });
});
