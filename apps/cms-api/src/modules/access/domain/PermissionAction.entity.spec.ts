import * as prismaEnums from '../../../generated/prisma/enums';
import { PermissionAction } from './PermissionAction.entity';

/** Fails to compile when either side has a value the other lacks. */
const domainFitsPrisma: Record<PermissionAction, prismaEnums.PermissionAction> =
  {} as Record<prismaEnums.PermissionAction, PermissionAction>;

describe('PermissionAction domain constants', () => {
  it('has exactly the values of the Prisma enum, byte for byte', () => {
    expect(domainFitsPrisma).toBeDefined();
    expect(Object.values(PermissionAction).sort()).toEqual(
      Object.values(prismaEnums.PermissionAction).sort(),
    );
  });

  it('maps every key to its own value', () => {
    for (const [key, value] of Object.entries(PermissionAction))
      expect(value).toBe(key);
  });
});
