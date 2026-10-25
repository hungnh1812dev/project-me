import * as prismaEnums from '../../../generated/prisma/enums';
import { OtpPurpose } from './OtpPurpose.entity';

/** Fails to compile when either side has a value the other lacks. */
const domainFitsPrisma: Record<OtpPurpose, prismaEnums.OtpPurpose> =
  {} as Record<prismaEnums.OtpPurpose, OtpPurpose>;

describe('OtpPurpose domain constants', () => {
  it('has exactly the values of the Prisma enum, byte for byte', () => {
    expect(domainFitsPrisma).toBeDefined();
    expect(Object.values(OtpPurpose).sort()).toEqual(
      Object.values(prismaEnums.OtpPurpose).sort(),
    );
  });

  it('maps every key to its own value', () => {
    for (const [key, value] of Object.entries(OtpPurpose))
      expect(value).toBe(key);
  });
});
