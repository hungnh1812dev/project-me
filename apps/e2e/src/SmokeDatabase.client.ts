import { execFileSync } from 'node:child_process';

import { e2eEnv } from './E2e.env';

/** A 1x1 PNG, used as the file URL so the preview really loads. */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_BYTES = 68;
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const SMOKE_HOST_SUFFIX = '.localhost';

/** Only a stack served on `*.localhost` is a smoke stack; never touch another one. */
function assertSmokeStack(): void {
  const { hostname } = new URL(e2eEnv.apiBaseUrl);
  if (!hostname.endsWith(SMOKE_HOST_SUFFIX)) {
    throw new Error(
      `refusing to run SQL: ${hostname} does not end with ${SMOKE_HOST_SUFFIX}`,
    );
  }
}

function runSql(statement: string): void {
  assertSmokeStack();
  execFileSync('docker', [
    'exec',
    e2eEnv.dbContainer,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    e2eEnv.dbUser,
    '-d',
    e2eEnv.dbName,
    '-c',
    statement,
  ]);
}

/** The reviewer endpoint allows one session per IP per 10 minutes. */
export function clearReviewerSessions(): void {
  runSql('DELETE FROM reviewer_sessions');
}

/**
 * Inserts library rows straight into the smoke database. The smoke stack runs
 * cms-api with dummy Cloudinary credentials, so real uploads cannot succeed
 * there; image rows get a thumbnail like real Cloudinary uploads; everything
 * after the upload (list, attach, in-use) is real.
 */
export function insertLibraryFiles(fileNames: string[]): void {
  for (const name of fileNames) {
    if (!SAFE_NAME.test(name)) throw new Error(`unsafe file name: ${name}`);
  }
  const values = fileNames
    .map(
      (name) =>
        `(gen_random_uuid(), '${name}', 'image/png', ${PNG_BYTES}, 1, 1, 'e2e/${name}', md5('${name}') || md5('${name}'), '${PNG_DATA_URL}', '${PNG_DATA_URL}', 'cloudinary')`,
    )
    .join(', ');
  runSql(
    `INSERT INTO file_library (document_id, file_name, mime_type, size, width, height, storage_key, sha256, url, thumbnail_url, provider) VALUES ${values};`,
  );
}
