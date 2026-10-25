import * as prismaEnums from '../../../generated/prisma/enums';
import { AccountStatus } from './AccountStatus.entity';

/** Fails to compile when either side has a value the other lacks. */
const domainFitsPrisma: Record<AccountStatus, prismaEnums.AccountStatus> =
  {} as Record<prismaEnums.AccountStatus, AccountStatus>;

describe('AccountStatus domain constants', () => {
  it('has exactly the values of the Prisma enum, byte for byte', () => {
    expect(domainFitsPrisma).toBeDefined();
    expect(Object.values(AccountStatus).sort()).toEqual(
      Object.values(prismaEnums.AccountStatus).sort(),
    );
  });

  it('maps every key to its own value', () => {
    for (const [key, value] of Object.entries(AccountStatus))
      expect(value).toBe(key);
  });
});
