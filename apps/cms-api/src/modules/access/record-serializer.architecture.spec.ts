import { join } from 'node:path';

import {
  assertPinnedPathsExist,
  listSourceFiles,
  reachedFilesOf,
} from '../../architecture/import-graph';
import {
  ACCESS_CONSTANTS_FILE,
  CONTENT_ENGINE_DIRECTORY,
  INTERNAL_COPY_FILES,
  PINNED_PATHS,
  RECORD_LOADER_CONSUMER_FILE,
  RECORD_LOADER_FILES,
  RECORD_READER_PORT_FILES,
  RECORD_SERIALIZER_FILE,
} from '../../architecture/source-paths.constants';

/**
 * Architecture test for SPEC D3: `RecordSerializer` is the only path from a
 * loaded content record to a response. Static rules over `src/`, checked on
 * the files imports resolve to (facades are followed), not on path strings:
 *
 * 1. Outside the content engine, a file that imports the record loaders
 *    (`KyselyContent.repository`, `TreeLoader.adapter`) or a record reader
 *    port (`Documents.port`) must also import
 *    `access/domain/RecordSerializer`, so loaded records are serialized where
 *    they are read.
 * 2. HTTP boundary files (everything in an `http/` folder, plus controllers,
 *    filters, interceptors and gateways by suffix) never import the record
 *    loaders: they only see serialized records.
 * 3. Only `RecordSerializer.ts` may cast to `SerializedRecord` (the brand
 *    that response types of document endpoints use).
 */

const SRC_ROOT = join(__dirname, '..', '..');
const GENERATED_DIR = 'generated';
const SERIALIZER_FILE = RECORD_SERIALIZER_FILE;
/** Files that only use the record types to build the serializer itself. */
const SERIALIZER_BUILDING_BLOCKS = [SERIALIZER_FILE, ACCESS_CONSTANTS_FILE];

/**
 * Files exempt from rule 1 (`INTERNAL_COPY_FILES`), each for a reason:
 * - the documents repository adapter loads records for the application
 *   services, which serialize them;
 * - publish (T22) copies a draft into the published row inside one
 *   transaction and returns `{ documentId, version }`; bulk (T34) only
 *   inserts trees and answers with ids and versions;
 * - the presence account adapter reads a public id and display name;
 * - presence reads a row version and returns presence entries;
 * - the module file only binds the port.
 */
const BOUNDARY_FILE =
  /(?:\.(?:controller|filter|interceptor|gateway)\.ts$|(?:^|[\\/])http[\\/])/;
const SERIALIZED_CAST = /\bas\s+SerializedRecord\b/;

const files = listSourceFiles(SRC_ROOT, { excludeDirs: [GENERATED_DIR] }).map(
  (source) => ({
    file: source.file,
    text: source.text,
    reached: reachedFilesOf(SRC_ROOT, source),
  }),
);

const importsRecordLoader = (reached: Set<string>) =>
  RECORD_LOADER_FILES.some((loader) => reached.has(loader));

const readsRecords = (reached: Set<string>) =>
  importsRecordLoader(reached) ||
  RECORD_READER_PORT_FILES.some((port) => reached.has(port));

describe('RecordSerializer is the only record -> response path', () => {
  it('scans the source tree', () => {
    assertPinnedPathsExist(SRC_ROOT, PINNED_PATHS);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(({ file }) => file === SERIALIZER_FILE)).toBe(true);
    expect(
      RECORD_LOADER_FILES.every((loader) =>
        files.some(({ file }) => file === loader),
      ),
    ).toBe(true);
  });

  it('still finds real edges: a record reader reaches the record loaders', () => {
    const consumer = files.find(
      ({ file }) => file === RECORD_LOADER_CONSUMER_FILE,
    );
    expect(
      consumer !== undefined && importsRecordLoader(consumer.reached),
    ).toBe(true);
  });

  it('record loaders are only used next to the serializer', () => {
    const offenders = files
      .filter(
        ({ file, reached }) =>
          !file.startsWith(CONTENT_ENGINE_DIRECTORY) &&
          !SERIALIZER_BUILDING_BLOCKS.includes(file) &&
          !INTERNAL_COPY_FILES.includes(file) &&
          readsRecords(reached) &&
          !reached.has(SERIALIZER_FILE),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('HTTP boundary files never import record loaders', () => {
    const offenders = files
      .filter(
        ({ file, reached }) =>
          BOUNDARY_FILE.test(file) && importsRecordLoader(reached),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('only the serializer produces SerializedRecord', () => {
    const offenders = files
      .filter(
        ({ file, text }) =>
          file !== SERIALIZER_FILE && SERIALIZED_CAST.test(text),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the rules match what they are meant to catch', () => {
    expect(BOUNDARY_FILE.test('documents/documents.controller.ts')).toBe(true);
    expect(
      BOUNDARY_FILE.test('modules/documents/http/Documents.routes.ts'),
    ).toBe(true);
    expect(BOUNDARY_FILE.test('modules/documents/adapters/Kysely.ts')).toBe(
      false,
    );
    expect(SERIALIZED_CAST.test('return body as SerializedRecord;')).toBe(true);
  });
});
