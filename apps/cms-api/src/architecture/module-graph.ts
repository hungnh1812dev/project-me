import { join, relative, sep } from 'node:path';

import {
  listSourceFiles,
  reachedFilesOf,
  resolveImports,
  withoutComments,
} from './import-graph';
import {
  ACCESS_MANAGEMENT_DIRECTORY,
  ACCESS_MODULE_DIRECTORY,
  DOCUMENT_AUTH_FILE,
  MODULE_NODES,
  MODULES_DIRECTORY,
  PLATFORM_DIRECTORIES,
  type ModuleNode,
} from './module-edges.constants';

export interface FileEdge {
  /** Path relative to `src/`. */
  from: string;
  to: string;
  fromNode: ModuleNode;
  toNode: ModuleNode;
}

/**
 * The node a file belongs to, or `null` for files outside the module graph
 * (composition root, architecture specs' helpers).
 */
export function nodeOfFile(file: string): ModuleNode | null {
  const [top, moduleName, ...rest] = file.split(sep);
  if ((PLATFORM_DIRECTORIES as readonly string[]).includes(top ?? '')) {
    return 'platform';
  }
  if (top !== MODULES_DIRECTORY || moduleName === undefined) return null;
  if (moduleName !== ACCESS_MODULE_DIRECTORY) {
    return (MODULE_NODES as readonly string[]).includes(moduleName)
      ? (moduleName as ModuleNode)
      : null;
  }
  const [first = ''] = rest;
  if (first === ACCESS_MANAGEMENT_DIRECTORY) return 'access-management';
  if (DOCUMENT_AUTH_FILE.test(first)) return 'access-document-auth';
  return 'access-core';
}

/** Every file-level import between two different nodes. */
export function collectCrossNodeEdges(srcRoot: string): {
  scannedFiles: number;
  edges: FileEdge[];
} {
  const sources = listSourceFiles(srcRoot);
  const edges = sources.flatMap((source) => {
    const fromNode = nodeOfFile(source.file);
    if (fromNode === null) return [];
    return [...reachedFilesOf(srcRoot, source)].flatMap((to) => {
      const toNode = nodeOfFile(to);
      return toNode === null || toNode === fromNode
        ? []
        : [{ from: source.file, to, fromNode, toNode }];
    });
  });
  return { scannedFiles: sources.length, edges };
}

export const SRC_ROOT = join(__dirname, '..');

export interface NodeImport {
  /** Path relative to `src/`. */
  file: string;
  fromNode: ModuleNode;
  /** Nodes the statement reaches, facades followed. Excludes `fromNode`. */
  toNodes: ModuleNode[];
  importedNames: string[] | 'all';
  isTypeOnly: boolean;
}

const TYPE_ONLY_STATEMENT =
  /^[ \t]*(?:import|export)\s+type\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm;

function typeOnlyCountsBySpecifier(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [, specifier = ''] of withoutComments(text).matchAll(
    TYPE_ONLY_STATEMENT,
  )) {
    counts.set(specifier, (counts.get(specifier) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every import statement of a module file that reaches another node, with
 * the names it brings in and whether it is written `import type`.
 */
export function collectNodeImports(srcRoot: string): NodeImport[] {
  return listSourceFiles(srcRoot).flatMap((source) => {
    const fromNode = nodeOfFile(source.file);
    if (fromNode === null) return [];
    const typeOnlyLeft = typeOnlyCountsBySpecifier(source.text);
    return resolveImports(source.absolutePath).flatMap((statement) => {
      const toNodes = [
        ...new Set(
          statement.targets.flatMap((target) => {
            const node = nodeOfFile(relative(srcRoot, target));
            return node === null || node === fromNode ? [] : [node];
          }),
        ),
      ];
      if (toNodes.length === 0) return [];
      const typeOnlyRemaining = typeOnlyLeft.get(statement.specifier) ?? 0;
      typeOnlyLeft.set(statement.specifier, typeOnlyRemaining - 1);
      return [
        {
          file: source.file,
          fromNode,
          toNodes,
          importedNames: statement.importedNames,
          isTypeOnly: typeOnlyRemaining > 0,
        },
      ];
    });
  });
}
