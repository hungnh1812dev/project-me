import * as prismaEnums from '../../../generated/prisma/enums';
import { TwoFaMethod } from './TwoFaMethod.entity';

/** Fails to compile when either side has a value the other lacks. */
const domainFitsPrisma: Record<TwoFaMethod, prismaEnums.TwoFaMethod> =
  {} as Record<prismaEnums.TwoFaMethod, TwoFaMethod>;

describe('TwoFaMethod domain constants', () => {
  it('has exactly the values of the Prisma enum, byte for byte', () => {
    expect(domainFitsPrisma).toBeDefined();
    expect(Object.values(TwoFaMethod).sort()).toEqual(
      Object.values(prismaEnums.TwoFaMethod).sort(),
    );
  });

  it('maps every key to its own value', () => {
    for (const [key, value] of Object.entries(TwoFaMethod))
      expect(value).toBe(key);
  });
});
