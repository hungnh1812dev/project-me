import { randomBytes } from 'node:crypto';

import { isUuidv7, UUID_BYTES, uuidv7 } from './Uuidv7.rules';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const randomOf = (): Uint8Array => randomBytes(UUID_BYTES);

describe('uuidv7', () => {
  it('has the v7 version and RFC variant', () => {
    expect(uuidv7(Date.now(), randomOf())).toMatch(UUID_V7_PATTERN);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const ms = 0x0190_1234_5678;
    expect(uuidv7(ms, randomOf()).replace(/-/g, '').slice(0, 12)).toBe('019012345678');
  });

  it('sorts by time and differs for the same millisecond', () => {
    const early = uuidv7(1_000, randomOf());
    const late = uuidv7(2_000, randomOf());
    expect(early < late).toBe(true);
    expect(uuidv7(5, randomOf())).not.toBe(uuidv7(5, randomOf()));
  });

  it('does not change the random bytes it is given', () => {
    const random = new Uint8Array(UUID_BYTES).fill(0xff);
    uuidv7(1_000, random);
    expect(random.every((byte) => byte === 0xff)).toBe(true);
  });
});

describe('isUuidv7', () => {
  it('accepts what uuidv7 makes', () => {
    expect(isUuidv7(uuidv7(Date.now(), randomOf()))).toBe(true);
  });

  it.each([
    '',
    '../x',
    '01900000-0000-4000-8000-000000000001',
    '01900000-0000-7000-c000-000000000001',
    '01900000-0000-7000-8000-00000000000A',
    '01900000-0000-7000-8000-000000000001\n',
    '01900000000070008000000000000001',
  ])('rejects %j', (value) => {
    expect(isUuidv7(value)).toBe(false);
  });
});
