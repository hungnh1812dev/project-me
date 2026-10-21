import { BadRequestException } from '@nestjs/common';

import {
  createRoleSchema,
  inviteAccountSchema,
  parseRequest,
  updateAccountSchema,
  updateRoleSchema,
} from './access-management.requests';

const ROLE_ID = '0195f3a0-0000-7000-8000-000000000001';

function errorOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('accounts & roles request schemas (T17)', () => {
  it('normalizes the invite email', () => {
    expect(
      parseRequest(inviteAccountSchema, {
        email: ' New@Example.TEST ',
        displayName: ' New ',
        roleId: ROLE_ID,
      }),
    ).toEqual({
      email: 'new@example.test',
      displayName: 'New',
      roleId: ROLE_ID,
    });
  });

  it('PATCH /accounts takes display name and role only (Q2), at least one', () => {
    expect(() =>
      parseRequest(updateAccountSchema, { email: 'x@example.test' }),
    ).toThrow(BadRequestException);
    expect(() => parseRequest(updateAccountSchema, {})).toThrow(
      BadRequestException,
    );
    expect(parseRequest(updateAccountSchema, { roleId: ROLE_ID })).toEqual({
      roleId: ROLE_ID,
    });
  });

  it.each([10, 40, 11.5])('rejects custom rank %s', (rank) => {
    expect(() =>
      parseRequest(createRoleSchema, { slug: 'writers', name: 'W', rank }),
    ).toThrow(BadRequestException);
  });

  it('rejects a slug outside the kebab-case pattern and a slug in PATCH', () => {
    expect(() =>
      parseRequest(createRoleSchema, { slug: 'Bad_Slug', name: 'W', rank: 20 }),
    ).toThrow(BadRequestException);
    expect(() => parseRequest(updateRoleSchema, { slug: 'other' })).toThrow(
      BadRequestException,
    );
  });

  it('reports issue paths without the submitted values', () => {
    const error = errorOf(() =>
      parseRequest(inviteAccountSchema, {
        email: 'secret-value',
        displayName: 'x',
        roleId: ROLE_ID,
      }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse();
    expect(response).toMatchObject({
      errorCode: 'ACCESS_INVALID_REQUEST',
      details: { issues: [{ path: ['email'] }] },
    });
    expect(JSON.stringify(response)).not.toContain('secret-value');
  });
});
