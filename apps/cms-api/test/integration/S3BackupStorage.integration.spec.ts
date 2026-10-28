import {
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';

import type { BackupStorageConfig } from '../../src/config/AppConfig.setup';
import {
  BackupStorageError,
  type StoredBackupObject,
} from '../../src/modules/backups/application/Backups.port';
import { S3BackupStorage } from '../../src/modules/backups/adapters/S3BackupStorage.adapter';

/** S3 stand-in. MinIO no longer publishes images on Docker Hub, so SeaweedFS (Apache-2.0). */
const S3_STAND_IN_IMAGE = 'chrislusf/seaweedfs:4.51';
const S3_STAND_IN_PORT = 8333;
const ACCESS_KEY_ID = 'test-access-key-id';
const SECRET_ACCESS_KEY = 'test-secret-access-key-0123456789';
const BUCKET = 'abyss-backups-test';
const PREFIX = 'postgres/';
const DAILY_PREFIX = `${PREFIX}daily/`;
const CONTENT_DISPOSITION =
  'attachment; filename="abyss-20261027T020000Z.dump.age"';
const DOWNLOAD_TTL_SECONDS = 60;
const SHORT_TTL_SECONDS = 1;
const PAST_SHORT_TTL_MS = 3_000;
const HTTP_FORBIDDEN = 403;

const OLDER_DAILY_OBJECTS = [
  { key: `${DAILY_PREFIX}abyss-20261025T020000Z.dump.age`, body: 'aaaa' },
  { key: `${DAILY_PREFIX}abyss-20261026T020000Z.dump.age`, body: 'bbbbbb' },
];
const NON_MATCHING_OBJECT = { key: `${PREFIX}notes.txt`, body: 'x' };
const DOWNLOADED = {
  key: `${DAILY_PREFIX}abyss-20261027T020000Z.dump.age`,
  body: 'cccccccc',
};
const DAILY_OBJECTS = [...OLDER_DAILY_OBJECTS, DOWNLOADED];

describe('S3BackupStorage against an S3 stand-in', () => {
  let container: StartedTestContainer;
  let storage: S3BackupStorage;
  let config: BackupStorageConfig;

  beforeAll(async () => {
    container = await new GenericContainer(S3_STAND_IN_IMAGE)
      .withEnvironment({
        AWS_ACCESS_KEY_ID: ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
      })
      .withCommand(['server', '-s3', '-dir=/data'])
      .withExposedPorts(S3_STAND_IN_PORT)
      .withWaitStrategy(
        Wait.forHttp('/', S3_STAND_IN_PORT).forStatusCodeMatching(
          (status) => status === HTTP_FORBIDDEN,
        ),
      )
      .start();
    config = {
      endpoint: `http://${container.getHost()}:${container.getMappedPort(S3_STAND_IN_PORT)}`,
      region: 'auto',
      bucket: BUCKET,
      prefix: PREFIX,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    };
    await uploadFixtures(config);
    storage = new S3BackupStorage(config);
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('lists every object under the prefix with its size', async () => {
    const listed = await storage.list(PREFIX);
    const expected: StoredBackupObject[] = [
      ...DAILY_OBJECTS,
      NON_MATCHING_OBJECT,
    ].map(({ key, body }) => ({ key, sizeBytes: body.length }));
    expect(sortByKey(listed)).toEqual(sortByKey(expected));
  });

  it('lists only the objects under a narrower prefix', async () => {
    const listed = await storage.list(DAILY_PREFIX);
    expect(listed.map((object) => object.key).sort()).toEqual(
      DAILY_OBJECTS.map(({ key }) => key).sort(),
    );
  });

  it('finds an existing object and returns null for a missing key', async () => {
    expect(await storage.find(DOWNLOADED.key)).toEqual({
      key: DOWNLOADED.key,
      sizeBytes: DOWNLOADED.body.length,
    });
    expect(await storage.find(`${DAILY_PREFIX}missing.dump.age`)).toBeNull();
  });

  it('throws an error without credentials when the bucket call fails', async () => {
    const wrongSecret = new S3BackupStorage({
      ...config,
      secretAccessKey: 'wrong-secret-access-key-0123456789',
    });
    const failure: unknown = await wrongSecret
      .find(DOWNLOADED.key)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BackupStorageError);
    const message = (failure as BackupStorageError).message;
    expect(message).not.toContain('wrong-secret');
    expect(message).not.toContain(ACCESS_KEY_ID);
  });

  it('issues a URL that downloads the exact bytes with the stored Content-Disposition', async () => {
    const url = await storage.createDownloadUrl(
      DOWNLOADED.key,
      DOWNLOAD_TTL_SECONDS,
    );
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      CONTENT_DISPOSITION,
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      DOWNLOADED.body,
    );
  });

  it('refuses the URL after it expired', async () => {
    const url = await storage.createDownloadUrl(
      DOWNLOADED.key,
      SHORT_TTL_SECONDS,
    );
    await new Promise((resolve) => setTimeout(resolve, PAST_SHORT_TTL_MS));
    expect((await fetch(url)).status).toBe(HTTP_FORBIDDEN);
  });
});

function sortByKey(objects: StoredBackupObject[]): StoredBackupObject[] {
  return [...objects].sort((a, b) => a.key.localeCompare(b.key));
}

/** Uploads like the nightly job: octet-stream plus a Content-Disposition. */
async function uploadFixtures(config: BackupStorageConfig): Promise<void> {
  const writer = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  await writer.send(new CreateBucketCommand({ Bucket: config.bucket }));
  for (const { key, body } of [...DAILY_OBJECTS, NON_MATCHING_OBJECT]) {
    await writer.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
        ContentDisposition: CONTENT_DISPOSITION,
      }),
    );
  }
  writer.destroy();
}
