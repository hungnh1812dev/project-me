import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  listSourceFiles,
  packageSpecifiersOf,
  reachedFilesOf,
} from './import-graph';

describe('import graph resolver', () => {
  let root: string;

  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const reached = (file: string) => {
    const source = listSourceFiles(root).find((s) => s.file === file);
    if (source === undefined) throw new Error(`missing ${file}`);
    return [...reachedFilesOf(root, source)].sort();
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'import-graph-'));
    write('engine/loader.ts', 'export class Loader {}');
    write('engine/safe.ts', 'export class Safe {}');
    write(
      'engine/index.ts',
      "export { Loader } from './loader';\nexport * from './safe';",
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('resolves a relative path to the file', () => {
    write('a.ts', "import { Loader } from './engine/loader';");
    expect(reached('a.ts')).toEqual(['engine/loader.ts']);
  });

  it('follows a facade to the file that defines the imported symbol', () => {
    write('a.ts', "import { Loader } from './engine';");
    write('b.ts', "import type { Safe } from './engine';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
    expect(reached('a.ts')).not.toContain('engine/safe.ts');
    expect(reached('b.ts')).toContain('engine/safe.ts');
    expect(reached('b.ts')).not.toContain('engine/loader.ts');
  });

  it('follows a nested facade, an alias and a dynamic import', () => {
    write('outer/index.ts', "export { Loader as Renamed } from '../engine';");
    write('a.ts', "import { Renamed } from './outer';");
    write('b.ts', "const load = () => import('./engine/loader');");
    expect(reached('a.ts')).toContain('engine/loader.ts');
    expect(reached('b.ts')).toContain('engine/loader.ts');
  });

  it('follows a facade that imports and then exports locally', () => {
    write(
      'hidden/index.ts',
      "import { Loader } from '../engine/loader';\nexport { Loader };",
    );
    write('a.ts', "import { Loader } from './hidden';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('reports package imports apart from files', () => {
    write('a.ts', "import { sql } from 'kysely';");
    const source = listSourceFiles(root).find((s) => s.file === 'a.ts');
    expect(reached('a.ts')).toEqual([]);
    expect(packageSpecifiersOf(source as never)).toEqual(['kysely']);
  });

  it('sees an import whose clause holds comments with quotes or semicolons', () => {
    write(
      'a.ts',
      "import {\n  // the loader's entry; do not drop\n  Loader,\n} from './engine/loader';",
    );
    expect(reached('a.ts')).toEqual(['engine/loader.ts']);
  });

  it('follows a barrel that is not called index.ts', () => {
    write('engine/public.ts', "export { Loader } from './loader';");
    write('engine/index.ts', "export * from './public';");
    write('a.ts', "import { Loader } from './engine/public';");
    write('b.ts', "import { Loader } from './engine';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
    expect(reached('b.ts')).toContain('engine/loader.ts');
  });

  it('follows a re-export placed in an ordinary file', () => {
    write(
      'core/service.ts',
      "export { Loader as Reader } from '../engine/loader';\nexport class Service {}",
    );
    write('a.ts', "import { Reader } from './core/service';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
    expect(reached('a.ts')).not.toContain('engine/safe.ts');
  });

  it('keeps a star-exported symbol of an unusual declaration form', () => {
    write(
      'gen/gen.ts',
      'export function* $read() {}\nexport const enum Mode {}\nexport namespace Space {}',
    );
    write('gen/index.ts', "export * from './gen';");
    write('a.ts', "import { $read } from './gen';");
    write('b.ts', "import { Space } from './gen';");
    expect(reached('a.ts')).toContain('gen/gen.ts');
    expect(reached('b.ts')).toContain('gen/gen.ts');
  });

  it('keeps an import it cannot pair with a clause', () => {
    write(
      'a.ts',
      "import type from './engine/loader';\nconst x = 1; // from './engine/safe'",
    );
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('sees a dynamic import after a wildcard route string', () => {
    write(
      'g.controller.ts',
      "@Get('files/*')\nasync list() {\n  const m = await import('./engine/loader');\n  return m;\n}\n/** docs */",
    );
    expect(reached('g.controller.ts')).toContain('engine/loader.ts');
  });

  it('follows a namespace import of an import-then-export barrel', () => {
    write(
      'engine/hidden.ts',
      "import { Loader } from './loader';\nexport { Loader };",
    );
    write('a.ts', "import * as engine from './engine/hidden';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('follows a default import of a barrel that exports it as default', () => {
    write(
      'engine/def.ts',
      "import { Loader } from './loader';\nexport default Loader;",
    );
    write('a.ts', "import loader from './engine/def';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('follows a re-exported whole-module import by name', () => {
    write('engine/ns.ts', "import * as tl from './loader';\nexport { tl };");
    write('a.ts', "import { tl } from './engine/ns';");
    write('b.ts', "import { tl } from './engine/star';");
    write('engine/star.ts', "export * as tl from './loader';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
    expect(reached('b.ts')).toContain('engine/loader.ts');
  });

  it('follows a whole-module import of a barrel that re-exports a whole module', () => {
    write('engine/ns.ts', "import * as tl from './loader';\nexport { tl };");
    write('a.ts', "import * as n from './engine/ns';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('follows an aliased export of an imported name', () => {
    write(
      'engine/al.ts',
      "import { Loader } from './loader';\nexport { Loader as safeLoad };",
    );
    write(
      'engine/ns4.ts',
      "import * as tl4 from './loader';\nexport { tl4 as renamed4 };",
    );
    write('a.ts', "import { safeLoad } from './engine/al';");
    write('b.ts', "import { renamed4 } from './engine/ns4';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
    expect(reached('b.ts')).toContain('engine/loader.ts');
  });

  it('follows a default import combined with a namespace import', () => {
    write(
      'engine/ns5.ts',
      "import d5, * as tl5 from './loader';\nexport { tl5 };",
    );
    write('a.ts', "import { tl5 } from './engine/ns5';");
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('is conservative: a benign barrel that lists exports also reaches its imports', () => {
    write(
      'engine/benign.ts',
      "import { Loader } from './loader';\nimport { Safe } from './safe';\nexport { Safe };",
    );
    write('a.ts', "import { Safe } from './engine/benign';");
    expect(reached('a.ts')).toContain('engine/safe.ts');
    // Known false positive: needs an allow-list entry in the spec that scans it.
    expect(reached('a.ts')).toContain('engine/loader.ts');
  });

  it('does not expand imports of a file without an export list or default', () => {
    write(
      'engine/plain.ts',
      "import { Loader } from './loader';\nexport class Plain {}",
    );
    write('a.ts', "import { Plain } from './engine/plain';");
    expect(reached('a.ts')).not.toContain('engine/loader.ts');
  });
});
