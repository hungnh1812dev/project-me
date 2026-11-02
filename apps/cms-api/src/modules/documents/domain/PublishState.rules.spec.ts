import { FieldSelection } from '../../access';
import { publishStateOf, writesEveryField } from './PublishState.rules';

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

describe('writesEveryField', () => {
  const FIELDS = ['title', 'body', 'sections'];

  it('is true for an unrestricted selection', () => {
    expect(writesEveryField(FieldSelection.ALL, FIELDS)).toBe(true);
  });

  it('is true when the list names every root field', () => {
    expect(writesEveryField(FieldSelection.of(FIELDS), FIELDS)).toBe(true);
  });

  it('is false when one root field is missing', () => {
    expect(writesEveryField(FieldSelection.of(['title', 'body']), FIELDS)).toBe(false);
  });

  it('is false when a component field is only partly listed', () => {
    expect(writesEveryField(FieldSelection.of(['title', 'body', 'sections.heading']), FIELDS)).toBe(
      false,
    );
  });

  it('is false for no access', () => {
    expect(writesEveryField(FieldSelection.NONE, FIELDS)).toBe(false);
  });
});
