import { Logger } from '@nestjs/common';

import { NestAppLogger } from './NestAppLogger.adapter';

describe('NestAppLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('forwards warn with its context', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    new NestAppLogger().warn('careful', 'Caller');
    expect(warn).toHaveBeenCalledWith('careful', 'Caller');
  });

  it('forwards error with no stack and its context', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    new NestAppLogger().error('broken', 'Caller');
    expect(error).toHaveBeenCalledWith('broken', undefined, 'Caller');
  });
});
