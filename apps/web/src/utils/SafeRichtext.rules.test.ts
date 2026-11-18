import { sanitizeRichtextOnServer } from '@/libs/SafeRichtext.server';

import { sanitizeRichtext } from './SafeRichtext.rules';

describe.each([
  ['browser', sanitizeRichtext],
  ['server', sanitizeRichtextOnServer],
])('richtext sanitizer (%s)', (_name, sanitize) => {
  it('drops script together with its text', () => {
    expect(sanitize('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('drops event handler attributes', () => {
    expect(sanitize('<p onclick="x()">a</p><img src=x onerror="y()">')).toBe('<p>a</p>');
  });

  it('drops javascript: and data: links but keeps the link text', () => {
    expect(sanitize('<a href="javascript:alert(1)">go</a>')).toBe('<a>go</a>');
    expect(sanitize('<a href="data:text/html,x">go</a>')).toBe('<a>go</a>');
  });

  it('drops protocol-relative links', () => {
    expect(sanitize('<a href="//evil.example">go</a>')).toBe('<a>go</a>');
  });

  it.each(['/\\evil.example', '\\\\evil.example', '\\/evil.example', '/\t/evil.example'])(
    'drops the host-changing link %j',
    (href) => {
      expect(sanitize(`<a href="${href}">go</a>`)).toBe('<a>go</a>');
    },
  );

  it('drops the text of textarea and option', () => {
    expect(sanitize('<textarea>t</textarea><option>o</option><p>ok</p>')).toBe('<p>ok</p>');
  });

  it('keeps the allowed tags and safe links', () => {
    const html =
      '<h2>T</h2><p><strong>a</strong> <em>b</em> <a href="https://example.com" title="t">c</a></p><ul><li>x</li></ul><a href="mailto:a@example.com">m</a>';
    expect(sanitize(html)).toBe(html);
  });

  it('forces rel on links that carry a target', () => {
    expect(sanitize('<a href="https://example.com" target="_blank">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('drops tags outside the list but keeps their text', () => {
    expect(sanitize('<div><span>a</span><iframe src="x"></iframe></div>')).toBe('a');
  });

  describe('text colour and alignment', () => {
    it('keeps a palette colour on span, lower case out', () => {
      expect(sanitize('<p><span style="color: #B91C1C">x</span></p>')).toBe(
        '<p><span style="color: #b91c1c">x</span></p>',
      );
      expect(sanitize('<span style="color:#1d4ed8;">x</span>')).toBe(
        '<span style="color: #1d4ed8">x</span>',
      );
    });

    it.each([
      'color: red',
      'color: #123456',
      'color: #b91c1c; background: url(x)',
      'background: red',
      'color: #b91c1c; position: fixed',
      '',
    ])('unwraps a span with style %j and keeps its text', (style) => {
      expect(sanitize(`<p><span style="${style}">x</span></p>`)).toBe('<p>x</p>');
    });

    it('drops an oversized style value', () => {
      const style = `color: #b91c1c;${' '.repeat(5000)}`;
      expect(sanitize(`<span style="${style}">x</span>`)).toBe('x');
    });

    it.each(['left', 'center', 'right', 'justify'])('keeps text-align %s on p and h1-h6', (a) => {
      expect(sanitize(`<p style="text-align: ${a}">x</p>`)).toBe(
        `<p style="text-align: ${a}">x</p>`,
      );
      expect(sanitize(`<h3 style="text-align:${a};">x</h3>`)).toBe(
        `<h3 style="text-align: ${a}">x</h3>`,
      );
    });

    it('drops other text-align values, extra declarations and style on other tags', () => {
      expect(sanitize('<p style="text-align: start">x</p>')).toBe('<p>x</p>');
      expect(sanitize('<p style="text-align: center; color: red">x</p>')).toBe('<p>x</p>');
      expect(sanitize('<p style="color: #b91c1c">x</p>')).toBe('<p>x</p>');
      expect(sanitize('<strong style="text-align: left">x</strong>')).toBe('<strong>x</strong>');
      expect(sanitize('<a href="https://example.com" style="color: #b91c1c">x</a>')).toBe(
        '<a href="https://example.com">x</a>',
      );
    });
  });

  describe('images', () => {
    const id = '0197f3a0-7b1c-7c3e-8a52-0123456789ab';
    const src = 'https://res.cloudinary.com/demo/image/upload/a.png';

    it('keeps src, alt and a UUID data-media-id', () => {
      const html = `<img src="${src}" alt="A" data-media-id="${id}">`;
      expect(sanitize(html)).toBe(html);
    });

    it('keeps an img without alt and lower-cases the id', () => {
      expect(sanitize(`<img src="${src}" data-media-id="${id.toUpperCase()}">`)).toBe(
        `<img src="${src}" data-media-id="${id}">`,
      );
    });

    it.each([
      ['missing', ''],
      ['not a UUID', ' data-media-id="x"'],
    ])('drops the img when data-media-id is %s', (_case, attr) => {
      expect(sanitize(`<p>a<img src="${src}"${attr}></p>`)).toBe('<p>a</p>');
    });

    it('drops other img attributes', () => {
      expect(
        sanitize(
          `<img src="${src}" data-media-id="${id}" onerror="alert(1)" width="9" style="x:y" srcset="x">`,
        ),
      ).toBe(`<img src="${src}" data-media-id="${id}">`);
    });

    it.each([
      ['another origin', 'https://evil.dev/a.png'],
      ['http', 'http://res.cloudinary.com/a.png'],
      ['another port', 'https://res.cloudinary.com:8443/a.png'],
      ['javascript', 'javascript:alert(1)'],
      ['data', 'data:image/png;base64,AAAA'],
      ['protocol relative', '//res.cloudinary.com/a.png'],
      ['malformed', 'https://'],
      ['scheme without slashes', 'https:res.cloudinary.com/a.png'],
      ['scheme with one slash', 'https:/res.cloudinary.com/a.png'],
      ['userinfo', 'https://x@res.cloudinary.com/a.png'],
      ['look-alike host', 'https://res.cloudinary.com.evil.dev/a.png'],
    ])('drops the img for %s', (_case, badSrc) => {
      expect(sanitize(`<p>a<img src="${badSrc}" alt="x" data-media-id="${id}"></p>`)).toBe(
        '<p>a</p>',
      );
    });

    it('does not let a dropped span or img change later elements', () => {
      expect(sanitize('<div>a</div><span style="color:red">b</span><section>c</section>')).toBe(
        'abc',
      );
    });
  });
});
