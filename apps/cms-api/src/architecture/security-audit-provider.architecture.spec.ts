import 'reflect-metadata';

import { join } from 'node:path';

import { SecurityAuditService } from '../modules/security-audit';
import { listSourceFiles } from './import-graph';

/**
 * SPEC D15 (audit AUD-AU1a-04): `SecurityAuditService` is provided in exactly
 * one Nest module, `SecurityAuditModule`; every other module imports that
 * module instead of listing a second provider.
 */
const SRC_ROOT = join(__dirname, '..');
const MODULE_FILE = /\.module\.ts$/;
const PROVIDERS_METADATA_KEY = 'providers';
const OWNER_MODULE_FILE = join(
  'modules',
  'security-audit',
  'security-audit.module.ts',
);

type ModuleClass = abstract new (...args: never[]) => unknown;

function moduleClassesOf(file: string): ModuleClass[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the file list is discovered at run time
  const loaded = require(join(SRC_ROOT, file)) as Record<string, unknown>;
  return Object.values(loaded).filter(
    (value): value is ModuleClass =>
      typeof value === 'function' &&
      Reflect.getMetadata(PROVIDERS_METADATA_KEY, value) !== undefined,
  );
}

const moduleFiles = listSourceFiles(SRC_ROOT)
  .map(({ file }) => file)
  .filter((file) => MODULE_FILE.test(file));

const providingFiles = moduleFiles.filter((file) =>
  moduleClassesOf(file).some((moduleClass) =>
    (
      Reflect.getMetadata(PROVIDERS_METADATA_KEY, moduleClass) as unknown[]
    ).includes(SecurityAuditService),
  ),
);

describe('SecurityAuditService provider (D15)', () => {
  it('scans the module files', () => {
    expect(moduleFiles.length).toBeGreaterThan(0);
  });

  it('appears in exactly one providers list, in SecurityAuditModule', () => {
    expect(providingFiles).toEqual([OWNER_MODULE_FILE]);
  });
});
