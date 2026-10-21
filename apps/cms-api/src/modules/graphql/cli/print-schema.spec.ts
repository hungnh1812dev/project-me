import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_CONTENT_PATHS } from '../../content-engine/cli/content-paths';
import { DEFAULT_SDL_FILE, printSchemaFile } from './print-schema';

const DEFINITION = JSON.stringify({
  slug: 'note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'title', type: 'string' }],
});

describe('print-schema', () => {
  let dir: string;
  let schemasDir: string;
  let sdlFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'print-schema-'));
    schemasDir = join(dir, 'schemas');
    sdlFile = join(dir, 'schema.graphql');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(schemasDir));
    await writeFile(join(schemasDir, 'note.json'), DEFINITION);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes the SDL, then reports it up to date', async () => {
    expect(
      await printSchemaFile({ schemasDir, sdlFile, check: false }),
    ).toEqual({
      status: 'written',
    });
    expect(await readFile(sdlFile, 'utf8')).toContain('noteList(');
    expect(
      await printSchemaFile({ schemasDir, sdlFile, check: false }),
    ).toEqual({
      status: 'up-to-date',
    });
  });

  it('--check reports missing and stale files and writes nothing', async () => {
    expect(await printSchemaFile({ schemasDir, sdlFile, check: true })).toEqual(
      {
        status: 'missing',
      },
    );
    await writeFile(sdlFile, 'type Query { stale: Int }\n');
    expect(await printSchemaFile({ schemasDir, sdlFile, check: true })).toEqual(
      {
        status: 'stale',
      },
    );
    expect(await readFile(sdlFile, 'utf8')).toBe('type Query { stale: Int }\n');
  });

  it('--check passes for the committed SDL of the real definitions', async () => {
    expect(
      await printSchemaFile({
        schemasDir: DEFAULT_CONTENT_PATHS.schemasDir,
        sdlFile: DEFAULT_SDL_FILE,
        check: true,
      }),
    ).toEqual({ status: 'up-to-date' });
  });
});
