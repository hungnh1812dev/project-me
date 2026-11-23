import { LAST_RESORT_TEXT, MOBILE_NAV_TEXT } from './LastResort.constants';

describe('built-in visitor text', () => {
  it('names the BFF in no last-resort or mobile nav text (WEB-13)', () => {
    const texts = [...Object.values(LAST_RESORT_TEXT), ...Object.values(MOBILE_NAV_TEXT)];
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => /bff/i.test(text))).toEqual([]);
  });
});
