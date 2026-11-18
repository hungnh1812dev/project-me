import { formatText, pickPlural } from './TextTemplate.rules';

describe('formatText', () => {
  it('fills named placeholders, each as often as it appears', () => {
    expect(formatText('Hi {name}, {name}!', { name: 'Ada' })).toBe('Hi Ada, Ada!');
  });

  it('fills a number value', () => {
    expect(formatText('Try again in {count} seconds', { count: 30 })).toBe(
      'Try again in 30 seconds',
    );
  });

  it('leaves an unknown placeholder as written', () => {
    expect(formatText('Hi {name} {other}', { name: 'Ada' })).toBe('Hi Ada {other}');
  });

  it('does not read inherited object keys as values', () => {
    expect(formatText('{toString}', {})).toBe('{toString}');
  });

  it('returns a template without placeholders unchanged', () => {
    expect(formatText('Sign in', { name: 'Ada' })).toBe('Sign in');
  });
});

describe('pickPlural', () => {
  const forms = { one: 'second', other: 'seconds' };

  it('picks one for 1', () => {
    expect(pickPlural(1, forms)).toBe('second');
  });

  it('picks other for 0 and for counts above 1', () => {
    expect(pickPlural(0, forms)).toBe('seconds');
    expect(pickPlural(2, forms)).toBe('seconds');
  });
});
