import { adapterFor } from './field-registry';

describe('adapterFor richtext', () => {
  const adapter = adapterFor('richtext');

  it('is editable and round-trips HTML text', () => {
    expect(adapter.editable).toBe(true);
    expect(adapter.toForm('<p>x</p>')).toBe('<p>x</p>');
    expect(adapter.toForm(null)).toBe('');
    expect(adapter.toApi('<p>x</p>')).toBe('<p>x</p>');
    expect(adapter.toApi('')).toBeNull();
  });
});
