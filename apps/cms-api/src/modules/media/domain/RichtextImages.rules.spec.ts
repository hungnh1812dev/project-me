import { mediaIdsInRichtext, rewriteRichtextImages } from './RichtextImages.rules';

const ID = '0190a000-0000-7000-8000-000000000001';
const OTHER = '0190a000-0000-7000-8000-000000000002';
const FILES = new Map([
  [ID, { url: 'https://cdn.test/new.png', mimeType: 'image/png' }],
  [OTHER, { url: 'https://cdn.test/doc.pdf', mimeType: 'application/pdf' }],
]);

describe('mediaIdsInRichtext', () => {
  it('lists distinct ids, lowercased, in any attribute order', () => {
    const html = `<p>a</p><img data-media-id="${ID.toUpperCase()}" src="x"><img src="y" alt="b" data-media-id="${ID}"><img src="z" data-media-id="${OTHER}" />`;
    expect(mediaIdsInRichtext(html)).toEqual([ID, OTHER]);
  });

  it('skips malformed ids so they never reach a uuid cast', () => {
    expect(
      mediaIdsInRichtext('<img src="x" data-media-id="not-a-uuid"><img data-media-id="">'),
    ).toEqual([]);
  });

  it('ignores images without an id and text that only looks like a tag', () => {
    expect(mediaIdsInRichtext('<img src="x"><p>&lt;img data-media-id="a"&gt;</p>')).toEqual([]);
  });
});

describe('rewriteRichtextImages', () => {
  it('replaces the src with the current url, whatever the attribute order', () => {
    const a = rewriteRichtextImages(`<img src="https://old/x.png" data-media-id="${ID}">`, FILES);
    const b = rewriteRichtextImages(
      `<img data-media-id="${ID}" alt="cat" src="https://old/x.png">`,
      FILES,
    );
    expect(a).toBe(`<img src="https://cdn.test/new.png" data-media-id="${ID}">`);
    expect(b).toBe(`<img data-media-id="${ID}" alt="cat" src="https://cdn.test/new.png">`);
  });

  it('adds a src when none is present and escapes the url', () => {
    const files = new Map([[ID, { url: 'https://cdn.test/a?x=1&y="2"', mimeType: 'image/png' }]]);
    expect(rewriteRichtextImages(`<img data-media-id="${ID}">`, files)).toBe(
      `<img src="https://cdn.test/a?x=1&amp;y=&quot;2&quot;" data-media-id="${ID}">`,
    );
  });

  it('removes the image when the file is missing or deleted', () => {
    const html = `<p>a</p><img src="x" data-media-id="0190a000-0000-7000-8000-0000000000ff"><p>b</p>`;
    expect(rewriteRichtextImages(html, FILES)).toBe('<p>a</p><p>b</p>');
  });

  it('removes an image with a malformed id', () => {
    expect(rewriteRichtextImages('<p>a</p><img src="x" data-media-id="nope">', FILES)).toBe(
      '<p>a</p>',
    );
  });

  it('removes the image when the id belongs to a non-image file', () => {
    expect(rewriteRichtextImages(`<img src="x" data-media-id="${OTHER}">`, FILES)).toBe('');
  });

  it('leaves html without media images untouched', () => {
    const html = '<p><strong>hi</strong> <a href="https://a.test">l</a></p><img src="x">';
    expect(rewriteRichtextImages(html, FILES)).toBe(html);
    expect(rewriteRichtextImages('', FILES)).toBe('');
  });
});
