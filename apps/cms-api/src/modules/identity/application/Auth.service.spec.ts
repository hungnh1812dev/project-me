import { DomainError } from '../../../common/errors/Domain.errors';
import { AUTH_ERROR_CODES } from '../domain/Identity.constants';
import { AuthService } from './Auth.service';
import { hashPassword, verifyPassword } from './Password.service';

jest.mock('./Password.service', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(() => Promise.resolve(false)),
}));

describe('AuthService dummy hash', () => {
  it('retries after a failed hash so unknown emails still get the 401', async () => {
    jest
      .mocked(hashPassword)
      .mockRejectedValueOnce(new Error('out of memory'))
      .mockResolvedValue('dummy');
    const service = new AuthService(
      { findLoginAccount: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        recordStandalone: jest.fn(),
        emailHmac: () => null,
      } as never,
    );

    await expect(service.ready()).rejects.toThrow('out of memory');

    const refusal: unknown = await service
      .login({ email: 'nobody@example.test', password: 'x' }, {} as never)
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(DomainError);
    expect((refusal as DomainError).errorCode).toBe(
      AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    );
    expect(verifyPassword).toHaveBeenCalledWith('dummy', 'x');
  });
});
