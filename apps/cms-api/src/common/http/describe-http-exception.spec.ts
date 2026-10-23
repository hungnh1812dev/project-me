import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

import { INTERNAL_ERROR_MESSAGE } from '../constants/error.constants';
import { describeHttpException } from './describe-http-exception';

describe('describeHttpException', () => {
  it('uses the named errorCode, message and details of a client error', () => {
    const described = describeHttpException(
      new BadRequestException({
        errorCode: 'CUSTOM',
        message: 'nope',
        details: [{ field: 'a' }],
      }),
    );
    expect(described).toEqual({
      statusCode: 400,
      errorCode: 'CUSTOM',
      message: 'nope',
      details: [{ field: 'a' }],
      isServerError: false,
    });
  });

  it('falls back to the status code and joins array messages', () => {
    const described = describeHttpException(
      new BadRequestException({ message: ['a bad', 'b bad'] }),
    );
    expect(described.errorCode).toBe('BAD_REQUEST');
    expect(described.message).toBe('a bad; b bad');
  });

  it('uses HTTP_ERROR for an unmapped client status', () => {
    const described = describeHttpException(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
    );
    expect(described.errorCode).toBe('HTTP_ERROR');
  });

  it('hides message and details of a server error', () => {
    const described = describeHttpException(
      new HttpException(
        { message: 'db down', details: { secret: 1 } },
        HttpStatus.BAD_GATEWAY,
      ),
    );
    expect(described.isServerError).toBe(true);
    expect(described.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(described.details).toBeUndefined();
  });
});
