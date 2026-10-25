import { sanitizeRichtext } from './RichtextSanitizer.rules';

describe('sanitizeRichtext', () => {
  it('keeps editor markup', () => {
    const html =
      '<h2>T</h2><p>a <strong>b</strong> <em>c</em> <s>d</s> <code>e</code></p><ul><li>x</li></ul><ol><li>y</li></ol><blockquote><p>q</p></blockquote><pre><code>z</code></pre><hr><p>l<br>m</p>';
    expect(sanitizeRichtext(html)).toBe(
      html.replace('<hr>', '<hr />').replace('<br>', '<br />'),
    );
  });

  it('keeps safe links and adds rel for target', () => {
    expect(
      sanitizeRichtext('<a href="https://x.dev" target="_blank">a</a>'),
    ).toBe(
      '<a href="https://x.dev" target="_blank" rel="noopener noreferrer">a</a>',
    );
    expect(sanitizeRichtext('<a href="mailto:a@b.c">m</a>')).toBe(
      '<a href="mailto:a@b.c">m</a>',
    );
  });

  const payloads: Array<[string, string]> = [
    ['script tag', '<p>a</p><script>alert(1)</script>'],
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg onload=alert(1)><circle/></svg>'],
    ['javascript url', '<a href="javascript:alert(1)">x</a>'],
    ['mixed case javascript url', '<a href="JaVaScRiPt:alert(1)">x</a>'],
    [
      'entity encoded javascript url',
      '<a href="&#106;avascript:alert(1)">x</a>',
    ],
    ['tab split javascript url', '<a href="java\tscript:alert(1)">x</a>'],
    ['data url', '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>'],
    ['vbscript url', '<a href="vbscript:msgbox(1)">x</a>'],
    ['onclick attr', '<p onclick="alert(1)">x</p>'],
    [
      'onmouseover on link',
      '<a href="https://x.dev" onmouseover="alert(1)">x</a>',
    ],
    ['iframe', '<iframe src="https://evil.dev"></iframe>'],
    ['style tag', '<style>body{display:none}</style><p>x</p>'],
    ['style attr', '<p style="background:url(javascript:alert(1))">x</p>'],
    ['object/embed', '<object data="x"></object><embed src="x">'],
    ['form', '<form action="https://evil.dev"><input name=a></form>'],
    ['protocol relative', '<a href="//evil.dev/x">x</a>'],
    [
      'meta refresh',
      '<meta http-equiv="refresh" content="0;url=https://evil.dev">',
    ],
    ['base tag', '<base href="https://evil.dev/">'],
  ];

  it.each(payloads)('neutralizes %s', (_name, payload) => {
    const out = sanitizeRichtext(payload).toLowerCase();
    expect(out).not.toMatch(
      /<script|<iframe|<style|<svg|<img|<form|<object|<embed|<meta|<base/,
    );
    expect(out).not.toMatch(/\son\w+\s*=/);
    expect(out).not.toMatch(/javascript:|vbscript:|data:|href="\/\//);
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('style=');
  });

  it('leaves only inert escaped text for split script tags', () => {
    const out = sanitizeRichtext('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(out).not.toContain('<');
  });

  it('keeps text of unknown wrapper tags', () => {
    expect(sanitizeRichtext('<div><span>hi</span></div>')).toBe('hi');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeRichtext('')).toBe('');
  });
});
