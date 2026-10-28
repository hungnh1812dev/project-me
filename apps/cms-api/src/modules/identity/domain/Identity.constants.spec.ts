import * as prismaEnums from '../../../generated/prisma/enums';
import { OtpPurpose, TwoFaMethod } from './Identity.constants';

/** Fails to compile when either side has a value the other lacks. */
const domainFitsPrisma: {
  otpPurpose: Record<OtpPurpose, prismaEnums.OtpPurpose>;
  twoFaMethod: Record<TwoFaMethod, prismaEnums.TwoFaMethod>;
} = {
  otpPurpose: {} as Record<prismaEnums.OtpPurpose, OtpPurpose>,
  twoFaMethod: {} as Record<prismaEnums.TwoFaMethod, TwoFaMethod>,
};

describe.each([
  ['OtpPurpose', OtpPurpose, prismaEnums.OtpPurpose],
  ['TwoFaMethod', TwoFaMethod, prismaEnums.TwoFaMethod],
] as const)('%s domain constants', (_name, domainValues, prismaValues) => {
  it('has exactly the values of the Prisma enum, byte for byte', () => {
    expect(domainFitsPrisma).toBeDefined();
    expect(Object.values(domainValues).sort()).toEqual(
      Object.values(prismaValues).sort(),
    );
  });

  it('maps every key to its own value', () => {
    for (const [key, value] of Object.entries(domainValues))
      expect(value).toBe(key);
  });
});
