import * as prismaEnums from '../../../generated/prisma/enums';
import { AccountStatus, PermissionAction } from './Access.constants';

/** Fail to compile when either side has a value the other lacks. */
const permissionActionFitsPrisma: Record<
  PermissionAction,
  prismaEnums.PermissionAction
> = {} as Record<prismaEnums.PermissionAction, PermissionAction>;
const accountStatusFitsPrisma: Record<
  AccountStatus,
  prismaEnums.AccountStatus
> = {} as Record<prismaEnums.AccountStatus, AccountStatus>;

describe.each([
  [
    'PermissionAction',
    PermissionAction,
    prismaEnums.PermissionAction,
    permissionActionFitsPrisma,
  ],
  [
    'AccountStatus',
    AccountStatus,
    prismaEnums.AccountStatus,
    accountStatusFitsPrisma,
  ],
])('%s domain constants', (_name, domain, prisma, fitsPrisma) => {
  it('has exactly the values of the Prisma enum, byte for byte', () => {
    expect(fitsPrisma).toBeDefined();
    expect(Object.values(domain).sort()).toEqual(Object.values(prisma).sort());
  });

  it('maps every key to its own value', () => {
    for (const [key, value] of Object.entries(domain)) expect(value).toBe(key);
  });
});
