import {
  accountRecord,
  actorWithRole,
  fakeRunner,
} from '../../../../../test/fixtures/management.fixture';
import type { IAppConfig } from '../../../../config/AppConfig.setup';
import type { OtpService } from '../../../identity';
import type { SecurityAuditService } from '../../../security-audit';
import { MANAGEMENT_ERROR_CODES } from '../domain/AccessManagement.constants';
import type { AccountAdminRepository } from './AccessManagement.port';
import { InvitationsService } from './Invitations.service';

const META = { ip: '203.0.113.7', userAgent: 'jest' };
const INPUT = {
  email: 'new@example.test',
  displayName: 'New',
  roleId: 'role-editor',
};
const EDITOR = {
  id: 4,
  documentId: 'role-editor',
  slug: 'editor',
  name: 'Editor',
  rank: 30,
  isSystem: true,
};
const INVITED = accountRecord({ email: INPUT.email, status: 'invited' });

function build(
  overrides: {
    role?: typeof EDITOR | null;
    isEmailTaken?: boolean;
    mailError?: Error;
    target?: ReturnType<typeof accountRecord> | null;
  } = {},
) {
  const { runner, unit, events } = fakeRunner();
  const accounts = {
    lockRoleForAssignment: jest.fn(() =>
      Promise.resolve(overrides.role === undefined ? EDITOR : overrides.role),
    ),
    isEmailTaken: jest.fn(() =>
      Promise.resolve(overrides.isEmailTaken ?? false),
    ),
    create: jest.fn(() => Promise.resolve(INVITED)),
    lockManageable: jest.fn(() =>
      Promise.resolve(
        overrides.target === undefined ? INVITED : overrides.target,
      ),
    ),
  };
  const otp = {
    issue: jest.fn(() => {
      events.push('otp');
      return Promise.resolve('123456');
    }),
  };
  const audit = {
    record: jest.fn(() => {
      events.push('audit');
      return Promise.resolve();
    }),
  };
  const mail = {
    send: jest.fn(() => {
      events.push('mail');
      return overrides.mailError === undefined
        ? Promise.resolve()
        : Promise.reject(overrides.mailError);
    }),
  };
  const logger = {
    warn: jest.fn((_message: string, _context?: string) => undefined),
    error: jest.fn(),
  };
  const config = { cors: { allowedOrigins: ['https://admin.example.test'] } };
  const service = new InvitationsService(
    runner,
    accounts as unknown as AccountAdminRepository,
    otp as unknown as OtpService,
    audit as unknown as SecurityAuditService,
    mail,
    config as unknown as IAppConfig,
    logger,
  );
  return { service, accounts, otp, audit, mail, logger, unit, events };
}

describe('InvitationsService', () => {
  describe('invite', () => {
    it('creates the account, audits and issues the code in one unit, then mails after the commit', async () => {
      const { service, accounts, otp, audit, unit, events } = build();
      const view = await service.invite(actorWithRole('admin'), INPUT, META);
      expect(accounts.create).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({
          email: INPUT.email,
          role: { id: EDITOR.id, slug: 'editor' },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({
          action: 'account.invited',
          metadata: { role: 'editor' },
        }),
      );
      expect(otp.issue).toHaveBeenCalledWith(
        INVITED.id,
        'INVITE_SET_PASSWORD',
        expect.objectContaining({ unit, ip: META.ip }),
      );
      expect(events).toEqual(['audit', 'otp', 'committed', 'mail']);
      expect(view.invitationSent).toBe(true);
    });

    it('answers 409 for a taken email and creates nothing', async () => {
      const { service, accounts, mail } = build({ isEmailTaken: true });
      await expect(
        service.invite(actorWithRole('admin'), INPUT, META),
      ).rejects.toMatchObject({
        kind: 'conflict',
        errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_EMAIL_TAKEN,
      });
      expect(accounts.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('refuses a role the actor does not outrank (owner is never assignable)', async () => {
      const { service, accounts } = build({
        role: { ...EDITOR, slug: 'owner', rank: 100 },
      });
      await expect(
        service.invite(actorWithRole('admin'), INPUT, META),
      ).rejects.toMatchObject({ kind: 'forbidden' });
      expect(accounts.create).not.toHaveBeenCalled();
    });

    it('keeps the account and logs only the error name and code when the mail fails', async () => {
      const smtp = Object.assign(new Error('rejected new@example.test'), {
        code: 'EENVELOPE',
      });
      const { service, logger } = build({ mailError: smtp });
      const view = await service.invite(actorWithRole('admin'), INPUT, META);
      expect(view.invitationSent).toBe(false);
      const logged = String(logger.warn.mock.calls[0]?.[0]);
      expect(logged).toContain('Error (EENVELOPE)');
      expect(logged).not.toContain('example.test');
    });
  });

  describe('resendInvite', () => {
    it('audits and issues a new code in one unit, then mails', async () => {
      const { service, audit, otp, events } = build();
      await expect(
        service.resendInvite(actorWithRole('admin'), INVITED.documentId, META),
      ).resolves.toEqual({ invitationSent: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'account.invite_resent' }),
      );
      expect(otp.issue).toHaveBeenCalledTimes(1);
      expect(events).toEqual(['audit', 'otp', 'committed', 'mail']);
    });

    it('answers 409 for an account that is not invited', async () => {
      const { service, otp, mail } = build({
        target: accountRecord({ status: 'active' }),
      });
      await expect(
        service.resendInvite(actorWithRole('admin'), INVITED.documentId, META),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_INVITED,
      });
      expect(otp.issue).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown or reviewer account', async () => {
      const { service } = build({ target: null });
      await expect(
        service.resendInvite(actorWithRole('admin'), INVITED.documentId, META),
      ).rejects.toMatchObject({ kind: 'not_found' });
    });
  });
});
