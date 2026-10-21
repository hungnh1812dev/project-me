import { BadRequestException } from '@nestjs/common';

import { ERROR_CODES } from '../../common/constants/error.constants';
import { ACCESS_ERROR_CODES, FIELD_ERROR_MESSAGES } from './access.constants';

/** 400s of the field checks (SPEC D3/D4), in the shared error body shape. */
export const fieldErrors = {
  notReadable: (path: string) =>
    new BadRequestException({
      errorCode: ACCESS_ERROR_CODES.FIELD_NOT_READABLE,
      message: FIELD_ERROR_MESSAGES.notReadable(path),
    }),
  notWritable: (path: string) =>
    new BadRequestException({
      errorCode: ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE,
      message: FIELD_ERROR_MESSAGES.notWritable(path),
    }),
  unknown: () =>
    new BadRequestException({
      errorCode: ACCESS_ERROR_CODES.FIELD_UNKNOWN,
      message: FIELD_ERROR_MESSAGES.unknown,
    }),
  invalidPayload: () =>
    new BadRequestException({
      errorCode: ERROR_CODES.BAD_REQUEST,
      message: FIELD_ERROR_MESSAGES.invalidPayload,
    }),
};
