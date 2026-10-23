import { uuidv7 } from './uuidv7';

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('has the v7 version and RFC variant', () => {
    expect(uuidv7()).toMatch(UUID_V7_PATTERN);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const ms = 0x0190_1234_5678;
    expect(uuidv7(ms).replace(/-/g, '').slice(0, 12)).toBe('019012345678');
  });

  it('sorts by time and differs for the same millisecond', () => {
    const early = uuidv7(1_000);
    const late = uuidv7(2_000);
    expect(early < late).toBe(true);
    expect(uuidv7(5)).not.toBe(uuidv7(5));
  });
});
