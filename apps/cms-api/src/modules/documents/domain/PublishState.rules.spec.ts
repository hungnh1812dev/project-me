import { publishStateOf } from './PublishState.rules';

describe('publishStateOf', () => {
  it('is draft when no published row exists', () => {
    expect(publishStateOf(3, null)).toBe('draft');
  });

  it('is modified when the versions differ', () => {
    expect(publishStateOf(4, 3)).toBe('modified');
  });

  it('is published when the versions are equal', () => {
    expect(publishStateOf(3, 3)).toBe('published');
  });
});
