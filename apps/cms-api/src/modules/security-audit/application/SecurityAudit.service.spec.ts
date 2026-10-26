import { TEST_SECRET_32_BYTES } from '../../../../test/fixtures/Env.fixture';
import { type IAppConfig } from '../../../config/AppConfig.setup';
import {
  type AuditLogWriter,
  SecurityAuditService,
} from './SecurityAudit.service';

function serviceWith(
  otpPepper: string | undefined,
  writer: AuditLogWriter = {} as AuditLogWriter,
): SecurityAuditService {
  const config = { secrets: { otpPepper } } as unknown as IAppConfig;
  return new SecurityAuditService(writer, config);
}

describe('SecurityAuditService.emailHmac (T17 Q4)', () => {
  const service = serviceWith(TEST_SECRET_32_BYTES);

  it('is a keyed hex digest of the normalized email, never the email', () => {
    const digest = service.emailHmac(' Someone@Example.test ');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(service.emailHmac('someone@example.test'));
    expect(digest).not.toBe(service.emailHmac('other@example.test'));
    expect(digest).not.toBe(
      serviceWith(`${TEST_SECRET_32_BYTES}x`).emailHmac('someone@example.test'),
    );
  });

  it('is null without OTP_PEPPER (development only)', () => {
    expect(serviceWith(undefined).emailHmac('someone@example.test')).toBeNull();
  });

  it('matches the known digest for a fixed pepper and email (byte-identical key derivation)', () => {
    expect(service.emailHmac('someone@example.test')).toBe(
      'e05ec55ad74b1063091c7f37a8cb64b6855a70046ea82450366ddb45c533b619',
    );
  });
});

describe('SecurityAuditService writing', () => {
  const entry = {
    actor: { type: 'system' },
    action: 'account.seeded',
  } as const;

  it('record passes the caller unit to the writer; recordStandalone does not take one', async () => {
    const writer = {
      write: jest.fn().mockResolvedValue(undefined),
      writeStandalone: jest.fn().mockResolvedValue(undefined),
    };
    const service = serviceWith(undefined, writer);
    const unit = { afterCommit: jest.fn() };
    await service.record(unit, entry);
    await service.recordStandalone(entry);
    expect(writer.write).toHaveBeenCalledWith(unit, entry);
    expect(writer.writeStandalone).toHaveBeenCalledWith(entry);
  });
});
