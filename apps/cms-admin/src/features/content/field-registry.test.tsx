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

describe('adapterFor media', () => {
  const adapter = adapterFor('media');
  const file = { id: 'u1', fileName: 'a.jpg' };

  it('is editable, keeps the embedded file and sends only its uuid', () => {
    expect(adapter.editable).toBe(true);
    expect(adapter.toForm(file)).toEqual(file);
    expect(adapter.toForm(null)).toBeNull();
    expect(adapter.toForm(7)).toBeNull();
    expect(adapter.toApi(file)).toBe('u1');
    expect(adapter.toApi(null)).toBeNull();
  });
});
