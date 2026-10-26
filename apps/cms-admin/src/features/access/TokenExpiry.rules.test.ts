import { endOfDay, expiryIso, localDateOf } from './TokenExpiry.rules';

describe('token expiry', () => {
  it('ends the chosen day at 23:59:59 local time', () => {
    const end = endOfDay('2030-03-05');
    expect(end?.getFullYear()).toBe(2030);
    expect(end?.getMonth()).toBe(2);
    expect(end?.getDate()).toBe(5);
    expect(end?.getHours()).toBe(23);
    expect(end?.getMinutes()).toBe(59);
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(endOfDay('')).toBeNull();
    expect(endOfDay('05/03/2030')).toBeNull();
    expect(endOfDay('2030-13-45')).toBeNull();
    expect(expiryIso('nope')).toBeNull();
  });

  it('round-trips through the API timestamp to the same local day', () => {
    const iso = expiryIso('2030-03-05');
    expect(iso).toMatch(/Z$/);
    expect(localDateOf(iso)).toBe('2030-03-05');
  });

  it('maps no expiry to an empty input', () => {
    expect(localDateOf(null)).toBe('');
  });
});
