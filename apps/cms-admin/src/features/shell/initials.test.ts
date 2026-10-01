import { describe, expect, it } from 'vitest';

import { getInitials } from './initials';

describe('getInitials', () => {
  it.each([
    ['Jane Doe', 'JD'],
    ['jane', 'J'],
    ['  Jane   Mary Doe  ', 'JD'],
    ['Đặng Văn Ánh', 'ĐÁ'],
    ['', '?'],
    [null, '?'],
    [undefined, '?'],
  ])('%j gives %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});
