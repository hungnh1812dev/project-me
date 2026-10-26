import { Controller, Get, UseGuards } from '@nestjs/common';

import { RequirePermission } from '../modules/access/http/Permission.guard';
import { PermissionAction } from '../generated/prisma/client';
import {
  type ControllerClass,
  handlersOf,
  hasPromisedGuard,
  isPermissionEnforced,
  PermissionGuard,
} from './controller-handlers';
import { DocumentAuthGuard } from '../modules/access/document-auth/http/DocumentAuth.guard';
import { JwtAuthGuard } from '../modules/identity/http/Jwt.strategy';

const READ_ROLES = {
  action: PermissionAction.read,
  subject: 'roles',
} as const;

function only(controller: unknown) {
  const [handler] = handlersOf(controller as ControllerClass);
  if (handler === undefined) throw new Error('controller has no handler');
  return handler;
}

describe('controller handler discovery (R1-02 guards)', () => {
  it('flags a requirement without PermissionGuard', () => {
    @Controller('a')
    class Unguarded {
      @Get()
      @RequirePermission(READ_ROLES)
      list() {}
    }
    expect(isPermissionEnforced(only(Unguarded))).toBe(false);
  });

  it('flags PermissionGuard with no authentication guard before it', () => {
    @Controller('a')
    class WrongOrder {
      @Get()
      @UseGuards(PermissionGuard, JwtAuthGuard)
      @RequirePermission(READ_ROLES)
      list() {}
    }
    expect(isPermissionEnforced(only(WrongOrder))).toBe(false);
  });

  it('accepts class-level auth plus method-level PermissionGuard', () => {
    @Controller('a')
    @UseGuards(JwtAuthGuard)
    class Mixed {
      @Get()
      @UseGuards(PermissionGuard)
      @RequirePermission(READ_ROLES)
      list() {}
    }
    expect(isPermissionEnforced(only(Mixed))).toBe(true);
  });

  it('checks the guard a reason promises', () => {
    @Controller('a')
    class Bare {
      @Get()
      list() {}
    }
    @Controller('b')
    @UseGuards(DocumentAuthGuard)
    class Documents {
      @Get()
      list() {}
    }
    expect(hasPromisedGuard(only(Bare), 'authenticated-only')).toBe(false);
    expect(hasPromisedGuard(only(Bare), 'public')).toBe(true);
    expect(hasPromisedGuard(only(Documents), 'document-auth-guard')).toBe(true);
    expect(hasPromisedGuard(only(Documents), 'authenticated-only')).toBe(false);
  });

  it('finds handlers inherited from a base class', () => {
    class Base {
      @Get()
      inherited() {}
    }
    @Controller('c')
    class Child extends Base {
      @Get('own')
      own() {}
    }
    const ids = handlersOf(Child as unknown as ControllerClass).map(
      ({ id }) => id,
    );
    expect(ids.sort()).toEqual(['Child.inherited', 'Child.own']);
  });
});
