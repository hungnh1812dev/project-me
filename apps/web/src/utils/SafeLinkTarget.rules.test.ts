import { isSafeLinkTarget } from './SafeLinkTarget.rules';

describe('isSafeLinkTarget', () => {
  it.each([
    'https://admin.example.com',
    'http://localhost:5173/admin',
    '/admin',
    '/admin/users?x=1',
  ])('accepts %s', (value) => {
    expect(isSafeLinkTarget(value)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '//evil.example',
    'admin.example.com',
    '/\\evil.example',
    '/\t/evil.example',
    '',
  ])('rejects %j', (value) => {
    expect(isSafeLinkTarget(value)).toBe(false);
  });
});
