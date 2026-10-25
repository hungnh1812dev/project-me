import { join, relative, sep } from 'node:path';

import {
  listSourceFiles,
  reachedFilesOf,
  resolveImports,
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

export const FILE_LAYERS = [
  'domain',
  'application',
  'adapters',
  'http',
  'cli',
  'jobs',
] as const;

export type FileLayer = (typeof FILE_LAYERS)[number] | 'wiring' | 'unlayered';

const WIRING_FILE = /^(?:index\.ts|[^/\\]+\.module\.ts)$/;

const isLayerFolder = (segment: string | undefined): boolean =>
  (FILE_LAYERS as readonly (string | undefined)[]).includes(segment);

/** Drops a layer folder that sits right after the module name (`access/http/...`). */
function withoutLayerFolder(rest: string[]): string[] {
  return rest.length > 1 && isLayerFolder(rest[0]) ? rest.slice(1) : rest;
}

/** The folder name of the module a file sits in (`modules/<name>/...`), or `null`. */
export function moduleFolderOf(file: string): string | null {
  const [top, moduleName] = file.split(sep);
  return top === MODULES_DIRECTORY && moduleName !== undefined
    ? moduleName
    : null;
}

/**
 * The layer a module file sits in (ADR 0006 §2). Module-root `index.ts` and
 * `*.module.ts` are wiring; anything else outside a layer folder, and every
 * file outside `modules/`, is unlayered. The management sub-module of
 * `access` has its own layer folders.
 */
export function layerOfFile(file: string): FileLayer {
  const [top, moduleName, ...rest] = file.split(sep);
  if (top !== MODULES_DIRECTORY || moduleName === undefined) return 'unlayered';
  const inner =
    moduleName === ACCESS_MODULE_DIRECTORY &&
    rest[0] === ACCESS_MANAGEMENT_DIRECTORY
      ? rest.slice(1)
      : rest;
  const [first = '', ...below] = inner;
  if (below.length === 0)
    return WIRING_FILE.test(first) ? 'wiring' : 'unlayered';
  return isLayerFolder(first) ? (first as FileLayer) : 'unlayered';
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
  const [first = ''] = withoutLayerFolder(rest);
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

/**
 * Every import statement of a module file that reaches another node, with
 * the names it brings in and whether it is written `import type`.
 */
export function collectNodeImports(srcRoot: string): NodeImport[] {
  return listSourceFiles(srcRoot).flatMap((source) => {
    const fromNode = nodeOfFile(source.file);
    if (fromNode === null) return [];
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
      return [
        {
          file: source.file,
          fromNode,
          toNodes,
          importedNames: statement.importedNames,
          isTypeOnly: statement.isTypeOnly,
        },
      ];
    });
  });
}
