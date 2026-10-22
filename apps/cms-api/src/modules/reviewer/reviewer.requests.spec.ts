import { createReviewerSessionSchema } from './reviewer.requests';

const VALID = { visitorRole: 'Recruiter', turnstileToken: 't' };

describe('createReviewerSessionSchema', () => {
  it('defaults tags and trims text', () => {
    const parsed = createReviewerSessionSchema.parse({
      ...VALID,
      visitorRole: '  Recruiter ',
      notes: ' hi ',
    });
    expect(parsed).toMatchObject({
      visitorRole: 'Recruiter',
      purposeTags: [],
      notes: 'hi',
    });
  });

  it.each([
    ['notes too long', { notes: 'a'.repeat(501) }],
    ['control char in notes', { notes: 'a\u0007b' }],
    ['newline in role', { visitorRole: 'a\nb' }],
    ['unknown key', { extra: 1 }],
  ])('rejects %s', (_name, patch) => {
    expect(
      createReviewerSessionSchema.safeParse({ ...VALID, ...patch }).success,
    ).toBe(false);
  });

  it('allows newlines in notes', () => {
    expect(
      createReviewerSessionSchema.safeParse({ ...VALID, notes: 'a\nb' })
        .success,
    ).toBe(true);
  });
});
