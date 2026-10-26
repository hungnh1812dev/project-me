import { type BadRequestException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import type { ClientIpResolver } from '../../../common/http/client-ip.resolver';
import {
  type OwnerSetupService,
  SetupClosedError,
} from '../application/OwnerSetup.service';
import { OwnerSetupController } from './OwnerSetup.controller';

const META = { ip: '203.0.113.9' };
const REQUEST = {
  method: 'POST',
  originalUrl: '/api/v1/setup/owner',
  get: () => undefined,
} as unknown as Request;

function setup(admit: jest.Mock = jest.fn()) {
  const createOwner = jest.fn(() =>
    Promise.resolve({ email: 'o@example.test' }),
  );
  const controller = new OwnerSetupController(
    { admit, createOwner } as unknown as OwnerSetupService,
    { resolve: () => META.ip } as unknown as ClientIpResolver,
  );
  return { controller, admit, createOwner };
}

describe('OwnerSetupController.createOwner', () => {
  it('admits the submitted token, then creates the owner from the parsed body', async () => {
    const { controller, admit, createOwner } = setup();
    const body = {
      setupToken: 'tok',
      email: ' O@Example.test ',
      password: 'correct horse battery staple',
    };
    await expect(controller.createOwner(body, REQUEST)).resolves.toEqual({
      email: 'o@example.test',
    });
    expect(admit).toHaveBeenCalledWith('tok', META);
    expect(createOwner).toHaveBeenCalledWith(
      {
        email: 'o@example.test',
        password: body.password,
      },
      META,
    );
  });

  it('checks the token before the body (a wrong token with a bad body is 401)', async () => {
    const unauthorized = new DomainError({
      kind: DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    });
    const { controller, createOwner } = setup(
      jest.fn(() => Promise.reject(unauthorized)),
    );
    await expect(
      controller.createOwner({ setupToken: 'nope', email: 42 }, REQUEST),
    ).rejects.toBe(unauthorized);
    expect(createOwner).not.toHaveBeenCalled();
  });

  it('answers 400 naming fields only for a right token and a bad body', async () => {
    const { controller, createOwner } = setup();
    const error: unknown = await controller
      .createOwner(
        { setupToken: 'tok', email: 'o@example.test', password: 'short' },
        REQUEST,
      )
      .catch((e: unknown) => e);
    const text = JSON.stringify((error as BadRequestException).getResponse());
    expect(text).toContain('password');
    expect(text).not.toContain('short');
    expect(createOwner).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-object body', 'text'],
    ['no body', undefined],
  ])('hands %s to admit as no token', async (_name, body) => {
    const { controller, admit } = setup();
    await controller.createOwner(body, REQUEST).catch(() => undefined);
    expect(admit).toHaveBeenCalledWith(undefined, META);
  });

  it('answers the unknown-route 404 when the setup is closed', async () => {
    const { controller } = setup(
      jest.fn(() => Promise.reject(new SetupClosedError())),
    );
    const error: unknown = await controller
      .createOwner({}, REQUEST)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(
      'Cannot POST /api/v1/setup/owner',
    );
  });
});
