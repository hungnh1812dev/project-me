import { sanitizeRichtext } from './SafeRichtext.rules';
import { sanitizeRichtextOnServer } from './SafeRichtext.server';

describe.each([
  ['browser', sanitizeRichtext],
  ['server', sanitizeRichtextOnServer],
])('richtext sanitizer (%s)', (_name, sanitize) => {
  it('drops script together with its text', () => {
    expect(sanitize('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('drops event handler attributes', () => {
    expect(sanitize('<p onclick="x()">a</p><img src=x onerror="y()">')).toBe(
      '<p>a</p>',
    );
  });

  it('drops javascript: and data: links but keeps the link text', () => {
    expect(sanitize('<a href="javascript:alert(1)">go</a>')).toBe('<a>go</a>');
    expect(sanitize('<a href="data:text/html,x">go</a>')).toBe('<a>go</a>');
  });

  it('drops protocol-relative links', () => {
    expect(sanitize('<a href="//evil.example">go</a>')).toBe('<a>go</a>');
  });

  it.each([
    '/\\evil.example',
    '\\\\evil.example',
    '\\/evil.example',
    '/\t/evil.example',
  ])('drops the host-changing link %j', (href) => {
    expect(sanitize(`<a href="${href}">go</a>`)).toBe('<a>go</a>');
  });

  it('drops the text of textarea and option', () => {
    expect(sanitize('<textarea>t</textarea><option>o</option><p>ok</p>')).toBe(
      '<p>ok</p>',
    );
  });

  it('keeps the allowed tags and safe links', () => {
    const html =
      '<h2>T</h2><p><strong>a</strong> <em>b</em> <a href="https://example.com" title="t">c</a></p><ul><li>x</li></ul><a href="mailto:a@example.com">m</a>';
    expect(sanitize(html)).toBe(html);
  });

  it('forces rel on links that carry a target', () => {
    expect(
      sanitize('<a href="https://example.com" target="_blank">x</a>'),
    ).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('drops tags outside the list but keeps their text', () => {
    expect(sanitize('<div><span>a</span><iframe src="x"></iframe></div>')).toBe(
      'a',
    );
  });
});
