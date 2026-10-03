import { describe, expect, it } from 'vitest';

import { changesOnRoundTrip, isAllowedHref, normalizeRichText } from './richtext';

describe('isAllowedHref (AC-12)', () => {
  it.each<[string, string]>([
    ['https', 'https://example.com/a?b=c#d'],
    ['http', 'http://example.com'],
    ['mailto', 'mailto:ada@example.com'],
    ['upper-case scheme', 'HTTPS://example.com'],
    ['surrounding spaces', '  https://example.com  '],
  ])('allows %s', (_case, href) => {
    expect(isAllowedHref(href)).toBe(true);
  });

  it.each<[string, string]>([
    ['javascript', 'javascript:alert(1)'],
    ['javascript with a tab inside the scheme', 'java\tscript:alert(1)'],
    ['upper-case javascript', 'JAVASCRIPT:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['ftp', 'ftp://example.com'],
    ['tel', 'tel:+123'],
    ['a relative path', '/about'],
    ['a protocol-relative URL', '//example.com'],
    ['a fragment', '#top'],
    ['an empty mailto', 'mailto:'],
    ['an empty string', ''],
    ['spaces only', '   '],
    ['an http URL without a host', 'http://'],
  ])('rejects %s', (_case, href) => {
    expect(isAllowedHref(href)).toBe(false);
  });
});

describe('normalizeRichText', () => {
  it('treats an empty document and a single empty paragraph as empty', () => {
    expect(normalizeRichText('')).toBe('');
    expect(normalizeRichText('<p></p>')).toBe('');
    expect(normalizeRichText('  \n ')).toBe('');
  });

  it('sorts attributes and escapes text and attribute values', () => {
    expect(
      normalizeRichText(
        '<p><a title="a &quot;b&quot;" href="https://x.test">1 &lt; 2 &amp; 3</a></p>',
      ),
    ).toBe('<p><a href="https://x.test" title="a &quot;b&quot;">1 &lt; 2 &amp; 3</a></p>');
  });

  it('keeps whitespace inside pre', () => {
    expect(normalizeRichText('<pre><code>a\n  b</code></pre>')).toBe(
      '<pre><code>a\n  b</code></pre>',
    );
  });

  it('keeps unknown elements, comments aside', () => {
    expect(normalizeRichText('<p>a<!-- note --><span>b</span></p>')).toBe('<p>a<span>b</span></p>');
  });
});

describe('changesOnRoundTrip (D2, AC-12)', () => {
  it.each<[string, string, string]>([
    ['empty and an empty paragraph', '', '<p></p>'],
    ['bare text and its paragraph', 'Hello', '<p>Hello</p>'],
    [
      'b/i/del/strike and strong/em/s',
      '<p><b>a</b> <i>b</i> <del>c</del> <strike>d</strike></p>',
      '<p><strong>a</strong> <em>b</em> <s>c</s> <s>d</s></p>',
    ],
    [
      'list items without paragraphs',
      '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>',
      '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
    ],
    [
      'a blockquote without a paragraph',
      '<blockquote>q</blockquote>',
      '<blockquote><p>q</p></blockquote>',
    ],
    [
      'an ordered list starting at 1',
      '<ol start="1"><li><p>a</p></li></ol>',
      '<ol><li><p>a</p></li></ol>',
    ],
    [
      'attribute order',
      '<p><a rel="x" href="https://x.test">x</a></p>',
      '<p><a href="https://x.test" rel="x">x</a></p>',
    ],
    ['collapsed whitespace', '<p>a   b\n c</p>', '<p>a b c</p>'],
    ['whitespace between blocks', '<h2>T</h2>\n\n<p> a </p>', '<h2>T</h2><p>a</p>'],
    ['inline text beside a block', 'Intro<p>Body</p>', '<p>Intro</p><p>Body</p>'],
  ])('is false for %s', (_case, before, after) => {
    expect(changesOnRoundTrip(before, after)).toBe(false);
  });

  it.each<[string, string, string]>([
    ['an inline style', '<p style="color: red">a</p>', '<p>a</p>'],
    ['a class', '<p class="lead">a</p>', '<p>a</p>'],
    ['a script', '<p>a</p><script>alert(1)</script>', '<p>a</p>'],
    ['an image', '<p>a<img src="x" onerror="alert(1)"></p>', '<p>a</p>'],
    ['an h1 turned into a paragraph', '<h1>T</h1>', '<p>T</p>'],
    ['a javascript: link dropped', '<p><a href="javascript:alert(1)">x</a></p>', '<p>x</p>'],
    ['an ordered list start', '<ol start="3"><li>a</li></ol>', '<ol><li><p>a</p></li></ol>'],
    ['changed text', '<p>a</p>', '<p>b</p>'],
    ['a table', '<table><tr><td>a</td></tr></table>', '<p>a</p>'],
  ])('is true for %s', (_case, before, after) => {
    expect(changesOnRoundTrip(before, after)).toBe(true);
  });
});
