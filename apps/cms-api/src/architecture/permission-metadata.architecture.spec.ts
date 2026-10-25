import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SYSTEM_SUBJECT_ACTIONS } from '../modules/access/domain/Access.constants';
import { PERMISSION_METADATA_KEY } from '../modules/access/permission.decorator';
import {
  type ControllerClass,
  handlersOf,
  hasPromisedGuard,
  isControllerClass,
  isPermissionEnforced,
} from './controller-handlers';
import { listSourceFiles } from './import-graph';
import { PUBLIC_HANDLERS } from './public-handlers.constants';

/**
 * SPEC D5 / D6 (audit X2): `PermissionGuard` allows a handler that has no
 * permission metadata. So every controller handler must either declare
 * `@RequirePermission` or be on the explicit public list, and the metadata
 * key the decorator writes must be the one key the guard reads.
 */
const SRC_ROOT = join(__dirname, '..');
const CONTROLLER_MARKER = '@Controller(';
const CONTROLLER_FILE = /\.controller\.ts$/;
const KEY_DECLARATION = /export const PERMISSION_METADATA_KEY\b/;
const KEY_USE_IN_DECORATOR = /SetMetadata\(\s*PERMISSION_METADATA_KEY\b/;

function controllerClassesOf(file: string): ControllerClass[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the file list is discovered at run time
  const loaded = require(join(SRC_ROOT, file)) as Record<string, unknown>;
  return Object.values(loaded).filter(isControllerClass);
}

const sources = listSourceFiles(SRC_ROOT);
const controllerFiles = sources.filter(({ text }) =>
  text.includes(CONTROLLER_MARKER),
);
const handlers = controllerFiles
  .flatMap(({ file }) => controllerClassesOf(file))
  .flatMap(handlersOf);

describe('permission metadata (D5, D6, X2)', () => {
  it('finds the controllers and handlers it checks', () => {
    expect(controllerFiles.length).toBeGreaterThan(0);
    expect(handlers.length).toBeGreaterThan(0);
  });

  it('every file declaring a controller is named *.controller.ts', () => {
    const misnamed = controllerFiles
      .filter(({ file }) => !CONTROLLER_FILE.test(file))
      .map(({ file }) => file);
    expect(misnamed).toEqual([]);
  });

  it('PermissionGuard runs after an authentication guard on every handler with a requirement', () => {
    const unenforced = handlers
      .filter((handler) => handler.requirement !== undefined)
      .filter((handler) => !isPermissionEnforced(handler))
      .map(({ id }) => id);
    expect(unenforced).toEqual([]);
  });

  it('every non-public reason on the list has the guard it promises', () => {
    const byId = new Map(handlers.map((handler) => [handler.id, handler]));
    const missing = PUBLIC_HANDLERS.filter(({ handler, reason }) => {
      const found = byId.get(handler);
      return found !== undefined && !hasPromisedGuard(found, reason);
    }).map(({ handler }) => handler);
    expect(missing).toEqual([]);
  });

  it('every handler has RequirePermission metadata or is on the public list', () => {
    const publicIds = new Set(PUBLIC_HANDLERS.map(({ handler }) => handler));
    const unprotected = handlers
      .filter(
        ({ requirement, id }) =>
          requirement === undefined && !publicIds.has(id),
      )
      .map(({ id }) => id);
    expect(unprotected).toEqual([]);
  });

  it('the public list names only handlers that exist and carry no permission metadata', () => {
    const withoutRequirement = new Set(
      handlers
        .filter(({ requirement }) => requirement === undefined)
        .map(({ id }) => id),
    );
    const stale = PUBLIC_HANDLERS.map(({ handler }) => handler).filter(
      (id) => !withoutRequirement.has(id),
    );
    expect(stale).toEqual([]);
  });

  it('the public list has no duplicate entries', () => {
    const ids = PUBLIC_HANDLERS.map(({ handler }) => handler);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every system subject exists in the subject table and allows the action', () => {
    const invalid = handlers.flatMap(({ id, requirement }) => {
      if (requirement === undefined || !('subject' in requirement)) return [];
      const allowed: readonly string[] | undefined = (
        SYSTEM_SUBJECT_ACTIONS as Record<string, readonly string[]>
      )[requirement.subject];
      return allowed?.includes(requirement.action) ? [] : [id];
    });
    expect(invalid).toEqual([]);
  });

  it('every content subject param is a path param of its route', () => {
    const invalid = handlers
      .filter(
        ({ requirement, routePath }) =>
          requirement !== undefined &&
          'subjectParam' in requirement &&
          !routePath.includes(`:${requirement.subjectParam}`),
      )
      .map(({ id }) => id);
    expect(invalid).toEqual([]);
  });

  it('PERMISSION_METADATA_KEY is declared once and set by one decorator', () => {
    const declaredIn = sources
      .filter(({ text }) => KEY_DECLARATION.test(text))
      .map(({ file }) => file);
    const setIn = sources
      .filter(({ text }) => KEY_USE_IN_DECORATOR.test(text))
      .map(({ file }) => file);
    expect(declaredIn).toHaveLength(1);
    expect(setIn).toHaveLength(1);
  });

  it('the permission key value is written once in the source', () => {
    const occurrences = sources.filter(({ absolutePath }) =>
      readFileSync(absolutePath, 'utf8').includes(PERMISSION_METADATA_KEY),
    );
    expect(occurrences.map(({ file }) => file)).toHaveLength(1);
  });
});
