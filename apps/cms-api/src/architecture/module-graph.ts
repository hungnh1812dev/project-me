import { join, sep } from 'node:path';

import { listSourceFiles, reachedFilesOf } from './import-graph';
import {
  ACCESS_MANAGEMENT_DIRECTORY,
  ACCESS_MODULE_DIRECTORY,
  DOCUMENT_AUTH_FILE,
  MODULE_NODES,
  MODULES_DIRECTORY,
  PLATFORM_DIRECTORIES,
  PRE_SPLIT_MANAGEMENT_FILE,
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
  if (PRE_SPLIT_MANAGEMENT_FILE.test(first)) return 'access-management';
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
