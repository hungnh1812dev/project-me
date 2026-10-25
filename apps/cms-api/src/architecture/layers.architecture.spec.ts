import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  findLayerViolations,
  listCheckedFiles,
  platformRoleOfFile,
  staleKnownViolations,
  unlistedViolations,
} from './layer-check';
import {
  KNOWN_LAYER_VIOLATIONS,
  MIGRATED_MODULES,
} from './layer-rules.constants';
import { SRC_ROOT } from './module-graph';
import { FIELD_PROJECTION_FILE } from './source-paths.constants';

/**
 * SPEC §2 layer rules (ADR 0006 §2): the imports of every file in a migrated
 * module follow `LAYER_RULES`. Modules that have not moved are not checked.
 */
describe('layer guard on the source tree (SPEC §2)', () => {
  const violations = findLayerViolations(SRC_ROOT, MIGRATED_MODULES);

  it('scans files once a module is migrated', () => {
    const checkedCount = listCheckedFiles(SRC_ROOT, MIGRATED_MODULES).length;
    expect(MIGRATED_MODULES.length === 0 || checkedCount > 0).toBe(true);
  });

  it('has no layer violation beyond KNOWN_LAYER_VIOLATIONS', () => {
    expect(unlistedViolations(violations)).toEqual([]);
  });

  it('lists no stale KNOWN_LAYER_VIOLATIONS entry', () => {
    expect(staleKnownViolations(violations)).toEqual([]);
  });

  it('keeps known violations to migrated modules', () => {
    const modules = KNOWN_LAYER_VIOLATIONS.map(
      ({ from }) => from.split('/')[1],
    );
    expect(
      modules.filter((name) => !MIGRATED_MODULES.includes(name ?? '')),
    ).toEqual([]);
  });
});

describe('the layer guard itself', () => {
  let root: string;
  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const check = (...modules: string[]) => findLayerViolations(root, modules);
  const rulesOf = (...modules: string[]) =>
    check(...modules).map(({ file, rule }) => `${file}: ${rule}`);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'layers-'));
    write(
      'modules/orders/adapters/Orders.repository.ts',
      'export const r = 1;',
    );
    write('modules/orders/domain/Order.entity.ts', 'export type Order = {};');
    write(
      'modules/billing/application/Invoices.service.ts',
      'export class InvoicesService {}',
    );
    write(
      'modules/billing/adapters/Invoices.repository.ts',
      'export class InvoicesRepository {}',
    );
    write(
      'modules/billing/domain/Invoice.entity.ts',
      'export type Invoice = {};',
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('fails application importing its own adapters', () => {
    write(
      'modules/orders/application/Place.service.ts',
      "import { r } from '../adapters/Orders.repository';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/application/Place.service.ts: own-layer',
    ]);
  });

  it('fails application importing Logger from @nestjs/common', () => {
    write(
      'modules/orders/application/Place.service.ts',
      "import { Logger } from '@nestjs/common';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/application/Place.service.ts: banned-package',
    ]);
  });

  it('passes application importing Injectable and Inject', () => {
    write(
      'modules/orders/application/Place.service.ts',
      "import { Inject, Injectable } from '@nestjs/common';",
    );
    expect(check('orders')).toEqual([]);
  });

  it('fails a namespace, default or bare import of @nestjs/common in application', () => {
    write(
      'modules/orders/application/A.service.ts',
      "import * as common from '@nestjs/common';",
    );
    write(
      'modules/orders/application/B.service.ts',
      "import common from '@nestjs/common';",
    );
    write(
      'modules/orders/application/C.service.ts',
      "import '@nestjs/common';",
    );
    expect(check('orders')).toHaveLength(3);
  });

  it('fails application importing another @nestjs package', () => {
    write(
      'modules/orders/application/Place.service.ts',
      "import { Cron } from '@nestjs/schedule';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/application/Place.service.ts: banned-package',
    ]);
  });

  it('fails domain importing kysely', () => {
    write(
      'modules/orders/domain/Filter.rules.ts',
      "import { sql } from 'kysely';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/domain/Filter.rules.ts: package-not-allowed',
    ]);
  });

  it('passes domain importing zod and fails an unlisted package', () => {
    write('modules/orders/domain/A.rules.ts', "import { z } from 'zod';");
    write('modules/orders/domain/B.rules.ts', "import { x } from 'lodash';");
    expect(rulesOf('orders')).toEqual([
      'modules/orders/domain/B.rules.ts: package-not-allowed',
    ]);
  });

  it('allows the named kysely exception in the two access domain files only', () => {
    write(
      'modules/access/domain/PolicyEvaluator.ts',
      "import { sql } from 'kysely';",
    );
    write(
      'modules/access/domain/Conditions.rules.ts',
      "import { sql } from 'kysely';",
    );
    write(
      'modules/access/domain/Other.rules.ts',
      "import { sql } from 'kysely';",
    );
    expect(rulesOf('access')).toEqual([
      'modules/access/domain/Other.rules.ts: package-not-allowed',
    ]);
  });

  it('limits node:crypto in domain to createHash', () => {
    write(
      'modules/orders/domain/A.rules.ts',
      "import { createHash } from 'node:crypto';",
    );
    write(
      'modules/orders/domain/B.rules.ts',
      "import { randomUUID } from 'node:crypto';",
    );
    write(
      'modules/orders/domain/C.rules.ts',
      "import * as crypto from 'node:crypto';",
    );
    write(
      'modules/orders/domain/D.rules.ts',
      "import { createHash } from 'crypto';",
    );
    expect(rulesOf('orders').sort()).toEqual([
      'modules/orders/domain/B.rules.ts: package-not-allowed',
      'modules/orders/domain/C.rules.ts: package-not-allowed',
      'modules/orders/domain/D.rules.ts: package-not-allowed',
    ]);
  });

  it('lets cli use its own adapters and another module adapter through its facade, not its own http', () => {
    write(
      'modules/billing/index.ts',
      "export { InvoicesRepository } from './adapters/Invoices.repository';",
    );
    write('modules/orders/http/Orders.controller.ts', 'export const c = 1;');
    write(
      'modules/orders/cli/own.ts',
      "import { r } from '../adapters/Orders.repository';",
    );
    write(
      'modules/orders/cli/other.ts',
      "import { InvoicesRepository } from '../../billing';",
    );
    write(
      'modules/orders/cli/http.ts',
      "import { c } from '../http/Orders.controller';",
    );
    expect(rulesOf('orders', 'billing')).toEqual([
      'modules/orders/cli/http.ts: own-layer',
    ]);
  });

  it('gives jobs the scheduling role only', () => {
    write('infrastructure/scheduling/Runner.ts', 'export const x = 1;');
    write('infrastructure/mail/Smtp.adapter.ts', 'export const s = 1;');
    write('infrastructure/mail/Mail.port.ts', 'export interface Mail {}');
    write(
      'modules/orders/jobs/Ok.job.ts',
      "import { x } from '../../../infrastructure/scheduling/Runner';",
    );
    write(
      'modules/orders/jobs/Bad.job.ts',
      "import { s } from '../../../infrastructure/mail/Smtp.adapter';\nimport { Mail } from '../../../infrastructure/mail/Mail.port';",
    );
    write(
      'modules/orders/adapters/Sched.adapter.ts',
      "import { x } from '../../../infrastructure/scheduling/Runner';",
    );
    expect(rulesOf('orders').sort()).toEqual([
      'modules/orders/adapters/Sched.adapter.ts: platform-role',
      'modules/orders/jobs/Bad.job.ts: platform-role',
      'modules/orders/jobs/Bad.job.ts: platform-role',
    ]);
  });

  it('picks the longest platform prefix', () => {
    expect(platformRoleOfFile('infrastructure/scheduling/x.ts')).toBe(
      'scheduling',
    );
    expect(platformRoleOfFile('infrastructure/scheduling/X.port.ts')).toBe(
      'port',
    );
    expect(platformRoleOfFile('infrastructure/mail/x.ts')).toBe('adapter');
  });

  it('judges a consumer import of a module only once that module is listed', () => {
    write('modules/billing/helper.ts', 'export const h = 1;');
    write('modules/billing/index.ts', "export { h } from './helper';");
    write(
      'modules/orders/application/Place.service.ts',
      "import { h } from '../../billing';",
    );
    expect(check('orders')).toEqual([]);
    expect(rulesOf('orders', 'billing')).toContain(
      'modules/orders/application/Place.service.ts: other-module-layer',
    );
  });

  it('fails import type from generated/prisma in application', () => {
    write('generated/prisma/client.ts', 'export type Account = {};');
    write(
      'modules/orders/application/Place.service.ts',
      "import type { Account } from '../../../generated/prisma/client';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/application/Place.service.ts: platform-role',
    ]);
  });

  it('fails a generated import that does not resolve to a file', () => {
    write(
      'modules/orders/application/Place.service.ts',
      "import type { Account } from '../../../generated/prisma';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/application/Place.service.ts: platform-role',
    ]);
  });

  it("passes application importing another module's application export through its facade", () => {
    write(
      'modules/billing/index.ts',
      "export { InvoicesService } from './application/Invoices.service';",
    );
    write(
      'modules/orders/application/Place.service.ts',
      "import { InvoicesService } from '../../billing';",
    );
    expect(check('orders', 'billing')).toEqual([]);
  });

  it("fails reaching another module's adapter through its facade", () => {
    write(
      'modules/billing/index.ts',
      "export { InvoicesRepository } from './adapters/Invoices.repository';",
    );
    write(
      'modules/orders/application/Place.service.ts',
      "import { InvoicesRepository } from '../../billing';",
    );
    expect(rulesOf('orders', 'billing')).toEqual([
      'modules/orders/application/Place.service.ts: other-module-layer',
    ]);
  });

  it("fails a deep import into another module's file", () => {
    write('modules/billing/index.ts', 'export {};');
    write(
      'modules/orders/application/Place.service.ts',
      "import { InvoicesService } from '../../billing/application/Invoices.service';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/application/Place.service.ts: deep-import',
    ]);
  });

  it('allows the named deep import of the access field projection from documents', () => {
    write(FIELD_PROJECTION_FILE, 'export const project = 1;');
    write(
      'modules/documents/application/Read.service.ts',
      "import { project } from '../../access/domain/FieldProjection.rules';",
    );
    expect(rulesOf('documents')).toEqual([]);
  });

  it('limits domain imports from another module to types and listed helpers', () => {
    write(
      'modules/billing/index.ts',
      'export type { Invoice } from "./domain/Invoice.entity";',
    );
    write(
      'modules/orders/domain/Link.rules.ts',
      "import type { Invoice } from '../../billing';\nimport { Invoice as Value } from '../../billing';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/domain/Link.rules.ts: cross-module-value',
    ]);
  });

  it('fails platform files outside the layer role', () => {
    write('common/http/helper.ts', 'export const h = 1;');
    write('common/errors/E.ts', 'export const e = 1;');
    write('infrastructure/mail/Mail.port.ts', 'export interface Mail {}');
    write('infrastructure/mail/Smtp.adapter.ts', 'export const s = 1;');
    write(
      'modules/orders/application/Place.service.ts',
      [
        "import { h } from '../../../common/http/helper';",
        "import { e } from '../../../common/errors/E';",
        "import { Mail } from '../../../infrastructure/mail/Mail.port';",
        "import { s } from '../../../infrastructure/mail/Smtp.adapter';",
      ].join('\n'),
    );
    expect(check('orders').map(({ to }) => to)).toEqual([
      join('common', 'http', 'helper.ts'),
      join('infrastructure', 'mail', 'Smtp.adapter.ts'),
    ]);
  });

  it('fails process.env, new Date() and Date.now( in domain and application, not new Date(x)', () => {
    write(
      'modules/orders/domain/A.rules.ts',
      'export const a = process.env.X;',
    );
    write('modules/orders/domain/B.rules.ts', 'export const b = new Date();');
    write(
      'modules/orders/application/C.service.ts',
      'export const c = Date.now();',
    );
    write(
      'modules/orders/domain/D.rules.ts',
      'export const d = new Date(5);\n// Date.now( in a comment',
    );
    expect(rulesOf('orders').sort()).toEqual([
      'modules/orders/application/C.service.ts: banned-text',
      'modules/orders/domain/A.rules.ts: banned-text',
      'modules/orders/domain/B.rules.ts: banned-text',
    ]);
  });

  it('jobs may use Logger and lifecycle hooks but not an adapter', () => {
    write(
      'modules/orders/jobs/Sweep.job.ts',
      "import { Logger, OnModuleInit } from '@nestjs/common';\nimport { r } from '../adapters/Orders.repository';",
    );
    expect(rulesOf('orders')).toEqual([
      'modules/orders/jobs/Sweep.job.ts: own-layer',
    ]);
  });

  it('fails an unlayered file but not index.ts or the module file', () => {
    write('modules/orders/index.ts', 'export {};');
    write('modules/orders/Orders.module.ts', 'export class OrdersModule {}');
    write('modules/orders/helper.ts', 'export const h = 1;');
    expect(rulesOf('orders')).toEqual([
      'modules/orders/helper.ts: unlayered-file',
    ]);
  });

  it('does not check modules outside the migrated list or the exempt roots', () => {
    write('modules/orders/helper.ts', 'export const h = 1;');
    write(
      'architecture/uses-constants.ts',
      "import { r } from '../modules/orders/adapters/Orders.repository';",
    );
    expect(check('billing')).toEqual([]);
  });

  it('reports stale and unlisted known violations', () => {
    const violations = [
      { file: 'modules/orders/helper.ts', rule: 'unlayered-file' },
    ];
    const known = [
      {
        from: 'modules/orders/helper.ts',
        rule: 'unlayered-file',
        removedBy: 'x',
      },
      {
        from: 'modules/orders/gone.ts',
        rule: 'unlayered-file',
        removedBy: 'x',
      },
    ];
    expect(unlistedViolations(violations, known)).toEqual([]);
    expect(staleKnownViolations(violations, known)).toEqual([known[1]]);
    expect(unlistedViolations(violations, [])).toEqual(violations);
  });

  it('classifies platform roles by folder', () => {
    expect(platformRoleOfFile('common/validation/x.ts')).toBe('pure');
    expect(platformRoleOfFile('common/filters/x.ts')).toBe('pipeline');
    expect(platformRoleOfFile('infrastructure/a/B.port.ts')).toBe('port');
    expect(platformRoleOfFile('infrastructure/a/B.adapter.ts')).toBe('adapter');
    expect(platformRoleOfFile('common/unknown/x.ts')).toBeNull();
  });
});
