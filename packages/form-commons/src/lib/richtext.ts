/**
 * Richtext rules (D1, D2): which links the editor accepts, and whether loading server HTML into
 * the editor and serialising it again would lose markup.
 */

/** The only link protocols the editor keeps (AC-12). */
export const ALLOWED_LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:'];

/** Shown when a link is rejected. */
export const LINK_ERROR = 'Links must start with http://, https:// or mailto:.';

/** The D2 warning, shown when the loaded HTML doesn't survive the editor's round trip. */
export const ROUND_TRIP_WARNING =
  "This entry contains formatting the editor can't keep. Saving will remove it.";

/**
 * Whether `href` may be a link target: an absolute `http:` or `https:` URL with a host, or a
 * `mailto:` with an address. Relative, protocol-relative and every other scheme are refused.
 */
export function isAllowedHref(href: string): boolean {
  let url: URL;
  try {
    // No base: only absolute URLs parse. The URL parser also strips tabs and newlines, so a
    // scheme split by them is read the way a browser would read it.
    url = new URL(href.trim());
  } catch {
    return false;
  }
  if (!ALLOWED_LINK_PROTOCOLS.includes(url.protocol)) return false;
  return url.protocol === 'mailto:' ? url.pathname !== '' : url.hostname !== '';
}

/** Elements that start a block; anything else counts as inline content. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

/** Elements whose loose inline content the editor wraps in a paragraph. */
const WRAPPING_TAGS = new Set(['blockquote', 'li']);

/** Tags the editor reads as another tag of the same meaning. */
const SYNONYMS: Readonly<Record<string, string>> = { b: 'strong', i: 'em', del: 's', strike: 's' };

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');

function attributesOf(tag: string, element: Element): string {
  return Array.from(element.attributes)
    .filter(
      (attribute) =>
        !(tag === 'ol' && attribute.name === 'start' && attribute.value.trim() === '1'),
    )
    .map((attribute) => `${attribute.name}="${escapeAttribute(attribute.value.trim())}"`)
    .sort()
    .map((attribute) => ` ${attribute}`)
    .join('');
}

function serializeNode(node: Node, inPre: boolean): string {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent ?? '';
    return escapeText(inPre ? text : text.replace(/\s+/g, ' '));
  }
  if (node.nodeType !== ELEMENT_NODE) return '';
  const element = node as Element;
  const raw = element.tagName.toLowerCase();
  const tag = SYNONYMS[raw] ?? raw;
  const pre = inPre || tag === 'pre';
  const inner = serializeChildren(element, WRAPPING_TAGS.has(tag), pre);
  return `<${tag}${attributesOf(tag, element)}>${inner}</${tag}>`;
}

/** The children of `parent`, with loose inline runs wrapped in a paragraph when `wrap` is set. */
function serializeChildren(parent: Node, wrap: boolean, inPre: boolean): string {
  let out = '';
  let run = '';
  const flush = () => {
    if (run.trim() !== '') out += `<p>${run}</p>`;
    run = '';
  };
  for (const child of Array.from(parent.childNodes)) {
    const isBlock =
      child.nodeType === ELEMENT_NODE && BLOCK_TAGS.has((child as Element).tagName.toLowerCase());
    const html = serializeNode(child, inPre);
    if (!wrap) out += html;
    else if (isBlock) {
      flush();
      out += html;
    } else run += html;
  }
  flush();
  return out;
}

const BLOCK_BOUNDARY = new RegExp(
  `\\s*(</?(?:${[...BLOCK_TAGS].join('|')})(?:\\s[^>]*)?>)\\s*`,
  'g',
);

/**
 * A canonical form of richtext HTML, for comparing two versions of the same content: tag synonyms
 * merged, attributes sorted, whitespace collapsed (outside `pre`) and trimmed at block edges,
 * loose inline content wrapped in paragraphs, comments dropped, and an empty paragraph read as
 * empty. Parsing uses `DOMParser`, whose document never runs scripts or loads images.
 */
export function normalizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const canonical = serializeChildren(doc.body, true, false).replace(BLOCK_BOUNDARY, '$1');
  return canonical === '<p></p>' ? '' : canonical;
}

/**
 * Whether the editor's serialisation (`after`) of loaded HTML (`before`) differs from it beyond
 * formatting-neutral changes, so saving would drop markup (D2).
 */
export function changesOnRoundTrip(before: string, after: string): boolean {
  return normalizeRichText(before) !== normalizeRichText(after);
}
