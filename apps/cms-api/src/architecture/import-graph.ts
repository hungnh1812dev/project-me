import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Shared import resolver for the architecture specs (SPEC D3, D18). Specs
 * decide on the file an import really reaches, never on the path string
 * written in the source. A module's `index.ts` facade is followed to the
 * file that defines each imported symbol, so re-exporting a record loader
 * through a facade does not hide it from a spec.
 */

const FACADE_FILE = 'index.ts';
const SOURCE_EXTENSION = '.ts';
const SPEC_SUFFIX = '.spec.ts';
const STAR_CLAUSE = '*';

type StatementKind = 'import' | 'export' | 'dynamic';

interface NameBinding {
  /** Name in the module the statement points at. */
  imported: string;
  /** Name in the file that holds the statement. */
  local: string;
}

interface ModuleStatement {
  kind: StatementKind;
  specifier: string;
  /** `'all'` for namespace, default, star and dynamic forms. */
  bindings: NameBinding[] | 'all';
  /** Local name of a namespace or default form (`* as ns`, `Default`). */
  wholeModuleName?: string;
}

export interface ResolvedImport {
  specifier: string;
  /** Real files the import reaches. Empty for packages and non-ts files. */
  targets: string[];
}

export interface SourceFile {
  /** Path relative to the scanned root. */
  file: string;
  absolutePath: string;
  text: string;
}

const STATEMENT_PATTERN =
  /^[ \t]*(import|export)\s+(?:type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|^[ \t]*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
/** Every specifier on its own, whatever the clause looks like. */
const ANY_SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|[^:'"\\])\/\/.*$/gm;

export interface ListSourceOptions {
  includeSpecs?: boolean;
  excludeDirs?: string[];
}

export function listSourceFiles(
  root: string,
  options: ListSourceOptions = {},
): SourceFile[] {
  const { includeSpecs = false, excludeDirs = [] } = options;
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return excludeDirs.includes(relative(root, path)) ? [] : walk(path);
      }
      const isSource = entry.name.endsWith(SOURCE_EXTENSION);
      const isSpec = entry.name.endsWith(SPEC_SUFFIX);
      return isSource && (includeSpecs || !isSpec) ? [path] : [];
    });
  return walk(root).map((absolutePath) => ({
    file: relative(root, absolutePath),
    absolutePath,
    text: readFileSync(absolutePath, 'utf8'),
  }));
}

function parseBindings(clause: string): NameBinding[] | 'all' {
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces === null) return 'all';
  const names = (braces[1] ?? '')
    .split(',')
    .map((item) => item.trim().replace(/^type\s+/, ''))
    .filter((item) => item !== '');
  return names.map((item) => {
    const [first = item, alias] = item.split(/\s+as\s+/);
    // `export { Original as Exposed }` and `import { Original as Alias }`
    return { imported: first, local: alias ?? first };
  });
}

export function withoutComments(text: string): string {
  return text.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '$1');
}

/**
 * Fail closed: a specifier the clause parser could not pair with a statement
 * is still reported, with `'all'` names, so an odd clause cannot hide it.
 */
function parseStatements(rawText: string): ModuleStatement[] {
  const text = withoutComments(rawText);
  const parsed = [...text.matchAll(STATEMENT_PATTERN)].map((match) => {
    const [, keyword, clause, fromSpecifier, bareSpecifier, dynamicSpecifier] =
      match;
    if (dynamicSpecifier !== undefined) {
      return { kind: 'dynamic', specifier: dynamicSpecifier, bindings: 'all' };
    }
    if (bareSpecifier !== undefined) {
      return { kind: 'import', specifier: bareSpecifier, bindings: 'all' };
    }
    const kind = keyword as StatementKind;
    const specifier = fromSpecifier ?? '';
    const bindings =
      (clause ?? '').trim() === STAR_CLAUSE
        ? 'all'
        : parseBindings(clause ?? '');
    const wholeModuleName = /^(?:\*\s*as\s+)?([\w$]+)\s*$/.exec(
      (clause ?? '').trim(),
    )?.[1];
    return { kind, specifier, bindings, wholeModuleName };
  }) as ModuleStatement[];

  const unpaired = new Map<string, number>();
  // Raw text on purpose: a `/*` inside a route string must not hide an import.
  // A commented-out import then counts as hidden, which fails closed.
  for (const [, specifier = ''] of rawText.matchAll(ANY_SPECIFIER_PATTERN)) {
    unpaired.set(specifier, (unpaired.get(specifier) ?? 0) + 1);
  }
  for (const { specifier } of parsed) {
    unpaired.set(specifier, (unpaired.get(specifier) ?? 0) - 1);
  }
  const hidden = [...unpaired].flatMap(([specifier, count]) =>
    count > 0
      ? Array.from({ length: count }, () => ({
          kind: 'import' as const,
          specifier,
          bindings: 'all' as const,
        }))
      : [],
  );
  return [...parsed, ...hidden];
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    `${base}${SOURCE_EXTENSION}`,
    join(base, FACADE_FILE),
    base,
  ];
  return (
    candidates.find(
      (path) =>
        path.endsWith(SOURCE_EXTENSION) &&
        existsSync(path) &&
        statSync(path).isFile(),
    ) ?? null
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsName(file: string, name: string): boolean {
  return new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`).test(
    withoutComments(readFileSync(file, 'utf8')),
  );
}

function isListedInExport(file: string, name: string): boolean {
  const listed = new RegExp(
    `export\\s*(?:type\\s*)?\\{[^}]*(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`,
  );
  return listed.test(withoutComments(readFileSync(file, 'utf8')));
}

function hasDefaultExport(file: string): boolean {
  return /\bexport\s+(?:default\b|=)/.test(
    withoutComments(readFileSync(file, 'utf8')),
  );
}

const LOCAL_EXPORT_LIST = /\bexport\s*(?:type\s*)?\{[^}]*\}(?!\s*from\b)/;

/**
 * Fail closed instead of tracking names through local export lists, aliases
 * and default exports: a file that exports a list or a default value may
 * expose any of its imports.
 */
function mayExposeItsImports(file: string): boolean {
  return (
    LOCAL_EXPORT_LIST.test(withoutComments(readFileSync(file, 'utf8'))) ||
    hasDefaultExport(file)
  );
}

/**
 * The file itself plus every file it re-exports the requested names from,
 * in any file (barrels need not be called `index.ts`). `'all'` follows every
 * re-export.
 */
function followReexports(
  file: string,
  requested: string[] | 'all',
  seen: Set<string>,
): string[] {
  const visitKey = `${file}|${requested === 'all' ? '*' : requested.join(',')}`;
  if (seen.has(visitKey)) return [];
  seen.add(visitKey);

  const statements = parseStatements(readFileSync(file, 'utf8')).flatMap(
    (statement) => {
      const target = resolveSpecifier(file, statement.specifier);
      return target === null ? [] : [{ statement, target }];
    },
  );
  const isStarExport = (statement: ModuleStatement) =>
    statement.kind === 'export' && statement.bindings === 'all';

  const exposedImports = mayExposeItsImports(file)
    ? statements.flatMap(({ statement, target }) =>
        statement.kind === 'import'
          ? followReexports(
              target,
              statement.bindings === 'all'
                ? 'all'
                : statement.bindings.map((binding) => binding.imported),
              seen,
            )
          : [],
      )
    : [];

  if (requested === 'all') {
    const followed = statements.flatMap(({ statement, target }) => {
      if (statement.kind !== 'export') return [];
      return followReexports(
        target,
        statement.bindings === 'all'
          ? 'all'
          : statement.bindings.map((binding) => binding.imported),
        seen,
      );
    });
    return [file, ...followed, ...exposedImports];
  }

  const followed = requested.flatMap((name) => {
    const named = statements.flatMap(({ statement, target }) => {
      if (statement.bindings === 'all') {
        const isWholeModuleReexport =
          statement.wholeModuleName === name &&
          (statement.kind === 'export' || isListedInExport(file, name));
        return isWholeModuleReexport
          ? followReexports(target, 'all', seen)
          : [];
      }
      const binding = statement.bindings.find(
        (candidate) => candidate.local === name,
      );
      const isReexport =
        statement.kind === 'export' || isListedInExport(file, name);
      return binding !== undefined && isReexport
        ? followReexports(target, [binding.imported], seen)
        : [];
    });
    const viaStar = statements
      .filter(({ statement }) => isStarExport(statement))
      .flatMap(({ target }) => {
        const deeper = followReexports(target, [name], seen);
        return mentionsName(target, name) ? deeper : deeper.slice(1);
      });
    return [...named, ...viaStar];
  });
  return [file, ...followed, ...exposedImports];
}

/** Every import and re-export of a file, resolved to the real files it reaches. */
export function resolveImports(absolutePath: string): ResolvedImport[] {
  const text = readFileSync(absolutePath, 'utf8');
  return parseStatements(text).map((statement) => {
    const target = resolveSpecifier(absolutePath, statement.specifier);
    if (target === null) return { specifier: statement.specifier, targets: [] };
    const requested =
      statement.bindings === 'all'
        ? 'all'
        : statement.bindings.map((binding) => binding.imported);
    const targets = followReexports(target, requested, new Set());
    return { specifier: statement.specifier, targets: [...new Set(targets)] };
  });
}

/** The set of real files (relative to `root`) a source file reaches. */
export function reachedFilesOf(root: string, source: SourceFile): Set<string> {
  return new Set(
    resolveImports(source.absolutePath).flatMap(({ targets }) =>
      targets.map((target) => relative(root, target)),
    ),
  );
}

/** Package names (non-relative specifiers) a source file imports. */
export function packageSpecifiersOf(source: SourceFile): string[] {
  return resolveImports(source.absolutePath)
    .map(({ specifier }) => specifier)
    .filter((specifier) => !specifier.startsWith('.'));
}
