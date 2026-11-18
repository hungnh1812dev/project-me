import { Logger } from '@nestjs/common';

import { NestAppLogger } from './NestAppLogger.adapter';

describe('NestAppLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('forwards info to the Nest log level with its context', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    new NestAppLogger().info('done', 'Caller');
    expect(log).toHaveBeenCalledWith('done', 'Caller');
  });

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
