import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SPEC D18 / D3: GraphQL reads go through `DocumentsQueryService` only, so
 * masking cannot be bypassed. No file here imports a record loader, the
 * field projection or Kysely.
 */
const FORBIDDEN_IMPORT =
  /(?:from|import\()\s*['"](?:[^'"]*content-engine\/(?:content\.repository|tree-loader)|[^'"]*access\/field-projection|kysely)['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

describe('graphql module architecture (D18)', () => {
  it('reads documents through DocumentsQueryService only', () => {
    const files = sourceFiles(__dirname);
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((file) =>
      FORBIDDEN_IMPORT.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
