import { testCatalog } from '../../../../../test/fixtures/access.fixture';
import {
  ACTOR_ID,
  actorWithRole,
  fakeRunner,
} from '../../../../../test/fixtures/management.fixture';
import { Clock } from '../../../../common/time/clock';
import type { SecurityAuditService } from '../../../security-audit';
import type { AccessPolicyService } from '../../application/AccessPolicy.service';
import type { VersionCache } from '../../application/VersionCache.service';
import { API_TOKEN, hashApiToken } from '../../domain/ApiToken.rules';
import { PolicyEvaluator } from '../../domain/PolicyEvaluator';
import { MANAGEMENT_ERROR_CODES } from '../domain/AccessManagement.constants';
import type {
  ApiTokenChange,
  ManagedApiToken,
  NewApiToken,
} from './AccessManagement.port';
import { ApiTokensService } from './ApiTokens.service';

const META = { ip: '203.0.113.7', userAgent: 'jest' };
const NOW = Date.UTC(2026, 0, 1);
const SCOPE = { permissions: [{ subject: 'article', action: 'read' }] };
const TOKEN: ManagedApiToken = {
  id: 9,
  documentId: 'token-doc',
  name: 'CI',
  tokenPrefix: 'ak_live_abcd',
  scope: SCOPE,
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: new Date(NOW),
  createdById: ACTOR_ID,
  createdBy: { documentId: 'creator-doc', displayName: 'Creator', roleId: 5 },
};

function build(locked: ManagedApiToken | null = TOKEN) {
  const { runner, unit, events } = fakeRunner();
  const tokens = {
    listPage: jest.fn(() => Promise.resolve({ rows: [TOKEN], total: 1 })),
    create: jest.fn((_unit: unknown, token: NewApiToken) =>
      Promise.resolve({ ...TOKEN, tokenPrefix: token.tokenPrefix }),
    ),
    lockByDocumentId: jest.fn(() => Promise.resolve(locked)),
    update: jest.fn((_unit: unknown, _id: number, change: ApiTokenChange) =>
      Promise.resolve({
        ...TOKEN,
        ...(change.name === undefined ? {} : { name: change.name }),
      }),
    ),
    markRevoked: jest.fn(() => Promise.resolve()),
  };
  const catalog = testCatalog();
  const access = {
    policy: () =>
      Promise.resolve({ catalog, evaluator: new PolicyEvaluator(catalog) }),
  };
  const versions = { getRolePolicy: jest.fn(() => Promise.resolve(null)) };
  const audit = {
    record: jest.fn(() => {
      events.push('audit');
      return Promise.resolve();
    }),
  };
  const clock = new Clock();
  jest.spyOn(clock, 'now').mockReturnValue(NOW);
  const service = new ApiTokensService(
    runner,
    tokens,
    access as unknown as AccessPolicyService,
    versions as unknown as VersionCache,
    audit as unknown as SecurityAuditService,
    clock,
  );
  return { service, tokens, versions, audit, unit };
}

describe('ApiTokensService', () => {
  describe('list', () => {
    it('shows an admin only their own tokens', async () => {
      const { service, tokens } = build();
      await service.list(actorWithRole('admin'), { page: 1, pageSize: 20 });
      expect(tokens.listPage).toHaveBeenCalledWith(ACTOR_ID, 1, 20);
    });

    it('shows the Owner every token, and never a hash or raw token', async () => {
      const { service, tokens } = build();
      const page = await service.list(actorWithRole('owner'), {
        page: 1,
        pageSize: 20,
      });
      expect(tokens.listPage).toHaveBeenCalledWith(undefined, 1, 20);
      expect(JSON.stringify(page)).not.toMatch(/tokenHash|"token"/);
      expect(page.data[0]).toMatchObject({ status: 'active' });
    });
  });

  describe('create', () => {
    it('stores only the hash, returns the raw token once and audits in the unit', async () => {
      const { service, tokens, audit, unit } = build();
      const created = await service.create(
        actorWithRole('admin'),
        { name: 'CI', scope: SCOPE },
        META,
      );
      expect(created.token.startsWith(API_TOKEN.PREFIX)).toBe(true);
      const stored = tokens.create.mock.calls[0]?.[1];
      expect(stored?.tokenHash).toBe(hashApiToken(created.token));
      expect(JSON.stringify(stored)).not.toContain(created.token);
      expect(audit.record).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({
          action: 'api_token.created',
          subject: 'api_tokens',
          metadata: {
            subjects: ['article'],
            permissionCount: 1,
            hasExpiry: false,
          },
        }),
      );
    });

    it('answers 400 for an expiry in the past', async () => {
      const { service, tokens } = build();
      await expect(
        service.create(
          actorWithRole('admin'),
          { name: 'CI', scope: SCOPE, expiresAt: new Date(NOW) },
          META,
        ),
      ).rejects.toMatchObject({
        kind: 'invalid_input',
        details: {
          issues: [{ path: ['expiresAt'], message: 'must be in the future' }],
        },
      });
      expect(tokens.create).not.toHaveBeenCalled();
    });

    it('answers 400 for a scope past the entry cap', async () => {
      const { service } = build();
      const scope = {
        permissions: Array.from(
          { length: API_TOKEN.MAX_SCOPE_ENTRIES + 1 },
          () => ({
            subject: 'article',
            action: 'read',
          }),
        ),
      };
      await expect(
        service.create(actorWithRole('admin'), { name: 'CI', scope }, META),
      ).rejects.toMatchObject({ kind: 'invalid_input' });
    });

    it('answers 403 with the entry indexes for a scope the creator does not hold', async () => {
      const { service, tokens } = build();
      const scope = {
        permissions: [
          { subject: 'article', action: 'read' },
          { subject: 'note', action: 'delete' },
        ],
      };
      await expect(
        service.create(actorWithRole('editor'), { name: 'CI', scope }, META),
      ).rejects.toMatchObject({
        kind: 'forbidden',
        errorCode: MANAGEMENT_ERROR_CODES.TOKEN_SCOPE_NOT_HELD,
        details: { indexes: [1] },
      });
      expect(tokens.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a token and audits the changed fields', async () => {
      const { service, audit } = build();
      await service.update(
        actorWithRole('admin'),
        TOKEN.documentId,
        { name: 'New' },
        META,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'api_token.updated',
          metadata: { fields: ['name'] },
        }),
      );
    });

    it('answers 409 API_TOKEN_EXPIRED for an expired token (ET1) and writes nothing', async () => {
      const { service, tokens } = build({ ...TOKEN, expiresAt: new Date(NOW) });
      await expect(
        service.update(
          actorWithRole('admin'),
          TOKEN.documentId,
          { name: 'New' },
          META,
        ),
      ).rejects.toMatchObject({
        kind: 'conflict',
        errorCode: MANAGEMENT_ERROR_CODES.TOKEN_EXPIRED,
      });
      expect(tokens.update).not.toHaveBeenCalled();
    });

    it('answers 409 API_TOKEN_REVOKED for a revoked token', async () => {
      const { service } = build({ ...TOKEN, revokedAt: new Date(NOW) });
      await expect(
        service.update(
          actorWithRole('admin'),
          TOKEN.documentId,
          { name: 'New' },
          META,
        ),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.TOKEN_REVOKED,
      });
    });

    it('answers 404 for another account token (not 403)', async () => {
      const { service, tokens } = build({
        ...TOKEN,
        createdById: ACTOR_ID + 1,
      });
      await expect(
        service.update(
          actorWithRole('admin'),
          TOKEN.documentId,
          { name: 'New' },
          META,
        ),
      ).rejects.toMatchObject({
        kind: 'not_found',
        errorCode: MANAGEMENT_ERROR_CODES.TOKEN_NOT_FOUND,
      });
      expect(tokens.update).not.toHaveBeenCalled();
    });

    it('checks a new scope against the creator current role when the Owner updates it', async () => {
      const { service, versions } = build({
        ...TOKEN,
        createdById: ACTOR_ID + 1,
      });
      await expect(
        service.update(
          actorWithRole('owner'),
          TOKEN.documentId,
          { scope: SCOPE },
          META,
        ),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.TOKEN_NOT_FOUND,
      });
      expect(versions.getRolePolicy).toHaveBeenCalledWith(5);
    });
  });

  describe('revoke', () => {
    it('stamps the revocation time from the clock and audits', async () => {
      const { service, tokens, audit, unit } = build();
      await service.revoke(actorWithRole('admin'), TOKEN.documentId, META);
      expect(tokens.markRevoked).toHaveBeenCalledWith(
        unit,
        TOKEN.id,
        new Date(NOW),
      );
      expect(audit.record).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({ action: 'api_token.revoked' }),
      );
    });

    it('answers 409 when the token is already revoked', async () => {
      const { service, tokens } = build({ ...TOKEN, revokedAt: new Date(NOW) });
      await expect(
        service.revoke(actorWithRole('admin'), TOKEN.documentId, META),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.TOKEN_REVOKED,
      });
      expect(tokens.markRevoked).not.toHaveBeenCalled();
    });

    it('still revokes an expired token', async () => {
      const { service, tokens } = build({
        ...TOKEN,
        expiresAt: new Date(NOW - 1),
      });
      await service.revoke(actorWithRole('admin'), TOKEN.documentId, META);
      expect(tokens.markRevoked).toHaveBeenCalled();
    });
  });
});
