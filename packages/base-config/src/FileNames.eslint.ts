import { isAbsolute, relative } from 'node:path';
import type { Rule } from 'eslint';

export interface FileNameRuleOptions {
  /** Exact file names accepted as they are, also with a test suffix (`page.test.tsx`). Default `['index.ts']`; `*.d.ts` is always accepted. */
  frameworkFileNames?: string[];
  /** Accept Next.js route folders (`[slug]`, `(group)`, `_private`, `@slot`). Default false. */
  allowsRouteSegmentFolders?: boolean;
  /** Every file needs a lower-case word: `<PascalName>.<word>.ts`. Default false. */
  isWordRequired?: boolean;
  /** Suffixes that mark a test file. Default `['test', 'spec']`. */
  testSuffixes?: string[];
  /** Top-level folders checked; files elsewhere are skipped. Default `['src', 'test', 'tests']`. */
  scannedFolders?: string[];
}

export const DEFAULT_SCANNED_FOLDERS = ['src', 'test', 'tests'];
export const CHECKED_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs'];
const KEBAB_FOLDER = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ROUTE_FOLDER =
  /^(\[\[?\.{0,3}[A-Za-z][A-Za-z0-9_-]*\]\]?|\([a-z][a-z0-9-]*\)|_[a-z0-9-]+|@[a-z0-9-]+)$/;
const NAME_SHAPE = /^(use)?([A-Z][A-Za-z0-9]*)$/;
const WORD_SHAPE = /^[a-z][a-z0-9]*$/;
const HOOK_NAME = /^use[A-Z]/;

interface ExportedValue {
  name: string;
  isFunction: boolean;
}

interface AstNode {
  type: string;
  id?: { name: string } | null;
  init?: { type: string } | null;
  exportKind?: string;
  declaration?: AstNode | null;
  declarations?: AstNode[];
  specifiers?: { exported: { name?: string; value?: unknown } }[];
}

const FUNCTION_INIT_TYPES = ['ArrowFunctionExpression', 'FunctionExpression'];

function collectValueExports(body: AstNode[]): ExportedValue[] {
  const values: ExportedValue[] = [];
  for (const node of body) {
    if (node.exportKind === 'type') continue;
    if (node.type === 'ExportDefaultDeclaration' && node.declaration?.id) {
      values.push({
        name: node.declaration.id.name,
        isFunction: node.declaration.type === 'FunctionDeclaration',
      });
    }
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
      values.push({ name: declaration.id.name, isFunction: true });
    } else if (declaration?.type === 'ClassDeclaration' && declaration.id) {
      values.push({ name: declaration.id.name, isFunction: false });
    } else if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations ?? []) {
        values.push({
          name: item.id?.name ?? '',
          isFunction: FUNCTION_INIT_TYPES.includes(item.init?.type ?? ''),
        });
      }
    }
    for (const specifier of node.specifiers ?? []) {
      const name = specifier.exported.name ?? String(specifier.exported.value);
      values.push({ name, isFunction: false });
    }
  }
  return values;
}

function lastPascalSegment(name: string): string {
  return (name.match(/[A-Z][a-z0-9]*$/)?.[0] ?? name).toLowerCase();
}

function isSameWord(first: string, second: string): boolean {
  const plurals = ['s', 'es'];
  return (
    first === second ||
    plurals.some((p) => first + p === second || second + p === first)
  );
}

/** Message for the first broken part of a path below a scanned folder, or null. */
function findFolderProblem(
  folders: string[],
  options: FileNameRuleOptions,
): string | null {
  for (const folder of folders) {
    const isRoute =
      options.allowsRouteSegmentFolders && ROUTE_FOLDER.test(folder);
    if (!isRoute && !KEBAB_FOLDER.test(folder)) {
      return `Folder "${folder}" must be kebab-case.`;
    }
  }
  return null;
}

interface ParsedFileName {
  name: string;
  middle: string[];
  extension: string;
  isTest: boolean;
  isFrameworkFile: boolean;
}

function parseFileName(
  fileName: string,
  options: FileNameRuleOptions,
): ParsedFileName {
  const frameworkNames = options.frameworkFileNames ?? ['index.ts'];
  const testSuffixes = options.testSuffixes ?? ['test', 'spec'];
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
  const parts = fileName.slice(0, fileName.lastIndexOf('.')).split('.');
  const isTest = parts.length > 1 && testSuffixes.includes(parts.at(-1) ?? '');
  if (isTest) parts.pop();
  const [name = '', ...middle] = parts;
  const isFrameworkFile =
    fileName.endsWith('.d.ts') ||
    frameworkNames.includes(fileName) ||
    (isTest &&
      !middle.length &&
      frameworkNames.includes(`${name}.${extension}`));
  return { name, middle, extension, isTest, isFrameworkFile };
}

/** Message for the first broken part of a parsed file name, or null. */
function findFileNameProblem(
  parsed: ParsedFileName,
  options: FileNameRuleOptions,
): string | null {
  const { name, middle, extension, isTest } = parsed;
  if (!NAME_SHAPE.test(name)) {
    return `"${name}" must be PascalCase, optionally with a "use" prefix for hooks.`;
  }
  if (middle.some((part) => !WORD_SHAPE.test(part))) {
    return 'Words after the name must be lower-case letters and digits.';
  }
  if (middle.length > (isTest ? 2 : 1)) {
    return `Too many dot parts: use <Name>[.<word>]${isTest ? '[.<variant>].<test>' : ''}.<ext>.`;
  }
  if (options.isWordRequired && middle.length === 0) {
    return `"${name}.${extension}" needs a function word: <Name>.<word>.${extension}.`;
  }
  const word = middle[0];
  const baseName = name.replace(/^use(?=[A-Z])/, '');
  if (word && isSameWord(lastPascalSegment(baseName), word)) {
    return `Word "${word}" repeats the end of the name "${name}".`;
  }
  return null;
}

/** Message for a mismatch between a file's hook name and its exports, or null. */
function findHookProblem(
  name: string,
  exportedValues: ExportedValue[],
): string | null {
  if (HOOK_NAME.test(name)) {
    return exportedValues.some((value) => value.name === name)
      ? null
      : `Hook file "${name}" must export a value named "${name}".`;
  }
  const [only] = exportedValues;
  if (
    exportedValues.length === 1 &&
    only?.isFunction &&
    HOOK_NAME.test(only.name)
  ) {
    return `File exports only the hook "${only.name}"; name the file "${only.name}".`;
  }
  return null;
}

function findFileProblem(
  parsed: ParsedFileName,
  options: FileNameRuleOptions,
  program: { body: unknown },
): string | null {
  const nameProblem = findFileNameProblem(parsed, options);
  if (nameProblem || parsed.isTest) return nameProblem;
  const body = program.body as AstNode[];
  return findHookProblem(parsed.name, collectValueExports(body));
}

export const fileNamesRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [{ type: 'object' }],
    messages: { invalid: '{{ problem }} (ADR 0008)' },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as FileNameRuleOptions;
    const scannedFolders = options.scannedFolders ?? DEFAULT_SCANNED_FOLDERS;
    const path = isAbsolute(context.filename)
      ? relative(context.cwd, context.filename)
      : context.filename;
    const [scannedFolder = '', ...rest] = path.split(/[\\/]/);
    const fileName = rest.pop() ?? '';
    const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
    const isChecked =
      scannedFolders.includes(scannedFolder) &&
      CHECKED_EXTENSIONS.includes(extension);
    if (!isChecked) return {};
    return {
      Program(program) {
        const parsed = parseFileName(fileName, options);
        const problem =
          findFolderProblem(rest, options) ??
          (parsed.isFrameworkFile
            ? null
            : findFileProblem(parsed, options, program));
        if (problem) {
          context.report({
            node: program,
            messageId: 'invalid',
            data: { problem },
          });
        }
      },
    };
  },
};
