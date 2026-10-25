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
  RECORD_SERIALIZER_FILE,
} from '../../architecture/source-paths.constants';

/**
 * Architecture test for SPEC D3: `RecordSerializer` is the only path from a
 * loaded content record to a response. Static rules over `src/`, checked on
 * the files imports resolve to (facades are followed), not on path strings:
 *
 * 1. Outside the content engine, a file that imports the record loaders
 *    (`content.repository`, `tree-loader`) must also import
 *    `access/record.serializer`, so loaded records are serialized where
 *    they are read.
 * 2. HTTP boundary files (controllers, filters, interceptors, gateways)
 *    never import the record loaders: they only see serialized records.
 * 3. Only `record.serializer.ts` may cast to `SerializedRecord` (the brand
 *    that response types of document endpoints use).
 */

const SRC_ROOT = join(__dirname, '..', '..');
const GENERATED_DIR = 'generated';
const SERIALIZER_FILE = RECORD_SERIALIZER_FILE;
/** Files that only use the record types to build the serializer itself. */
const SERIALIZER_BUILDING_BLOCKS = [SERIALIZER_FILE, ACCESS_CONSTANTS_FILE];

/**
 * Publish (T22) copies a draft into the published row inside one transaction.
 * The copied record is never part of a response (it returns `{ documentId,
 * version }`), so these files need no serializer. Bulk (T34) only inserts
 * trees through the repository and answers with ids and versions.
 */
const BOUNDARY_FILE = /\.(?:controller|filter|interceptor|gateway)\.ts$/;
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
          importsRecordLoader(reached) &&
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
    expect(SERIALIZED_CAST.test('return body as SerializedRecord;')).toBe(true);
  });
});
