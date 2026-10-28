import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { describeError } from '../../../common/http/DescribeHttpException.rules';
import { ERROR_CODES } from '../../../common/constants/Error.constants';
import { systemRole } from '../../../../test/fixtures/Access.fixture';
import {
  ACCESS_ERROR_CODES,
  FIELD_ERROR_MESSAGES,
  RANK_FORBIDDEN_ERROR,
} from './Access.constants';
import { anonymousActor, unauthenticated } from './ActorContext.entity';
import { fieldErrors } from './FieldPaths.rules';
import { rankForbidden, requireAccountActor } from './Rank.rules';

/** What the client sees must equal the Nest exception these errors replaced. */
describe('access error bodies', () => {
  it.each([
    [
      'FIELD_NOT_READABLE',
      fieldErrors.notReadable('title'),
      new BadRequestException({
        errorCode: ACCESS_ERROR_CODES.FIELD_NOT_READABLE,
        message: FIELD_ERROR_MESSAGES.notReadable('title'),
      }),
    ],
    [
      'FIELD_NOT_WRITABLE',
      fieldErrors.notWritable('title'),
      new BadRequestException({
        errorCode: ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE,
        message: FIELD_ERROR_MESSAGES.notWritable('title'),
      }),
    ],
    [
      'FIELD_UNKNOWN',
      fieldErrors.unknown(),
      new BadRequestException({
        errorCode: ACCESS_ERROR_CODES.FIELD_UNKNOWN,
        message: FIELD_ERROR_MESSAGES.unknown,
      }),
    ],
    [
      'invalid payload',
      fieldErrors.invalidPayload(),
      new BadRequestException({
        errorCode: ERROR_CODES.BAD_REQUEST,
        message: FIELD_ERROR_MESSAGES.invalidPayload,
      }),
    ],
    [
      'ACCESS_RANK_FORBIDDEN',
      rankForbidden(),
      new ForbiddenException({
        errorCode: RANK_FORBIDDEN_ERROR.CODE,
        message: RANK_FORBIDDEN_ERROR.MESSAGE,
      }),
    ],
    ['bare 401', unauthenticated(), new UnauthorizedException()],
  ])('%s answers as before', (_name, error, previous) => {
    expect(describeError(error)).toEqual(describeError(previous));
  });

  it('answers a non-account actor with the bare 403', () => {
    let caught: unknown;
    try {
      requireAccountActor(anonymousActor(systemRole('public')));
    } catch (error) {
      caught = error;
    }
    expect(describeError(caught)).toEqual(
      describeError(new ForbiddenException()),
    );
  });
});
