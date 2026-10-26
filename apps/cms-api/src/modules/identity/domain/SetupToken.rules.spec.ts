import { SETUP_TOKEN_MAX_LENGTH } from './Identity.constants';
import { isSetupTokenValid } from './SetupToken.rules';

const CONFIGURED = 'a-configured-setup-token-0123456789';

describe('isSetupTokenValid', () => {
  it('accepts the configured token', () => {
    expect(isSetupTokenValid(CONFIGURED, CONFIGURED)).toBe(true);
  });

  it('refuses a different token of the same length', () => {
    const other = `${CONFIGURED.slice(0, -1)}X`;
    expect(isSetupTokenValid(other, CONFIGURED)).toBe(false);
  });

  it.each([
    ['a prefix', CONFIGURED.slice(0, 10)],
    ['a longer value', `${CONFIGURED}extra`],
    ['an empty string', ''],
  ])('refuses %s', (_name, value) => {
    expect(isSetupTokenValid(value, CONFIGURED)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 12345],
    ['an object', { token: CONFIGURED }],
    ['an array', [CONFIGURED]],
  ])('refuses %s', (_name, value) => {
    expect(isSetupTokenValid(value, CONFIGURED)).toBe(false);
  });

  it('refuses a value over the length cap, even when it starts with the token', () => {
    const long = CONFIGURED.padEnd(SETUP_TOKEN_MAX_LENGTH + 1, 'x');
    expect(isSetupTokenValid(long, CONFIGURED)).toBe(false);
  });

  it('accepts a configured token of exactly the cap length', () => {
    const atCap = 'y'.repeat(SETUP_TOKEN_MAX_LENGTH);
    expect(isSetupTokenValid(atCap, atCap)).toBe(true);
  });
});
