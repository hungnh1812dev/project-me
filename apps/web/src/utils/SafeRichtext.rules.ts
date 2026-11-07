import DOMPurify, { type Config } from 'dompurify';

import {
  CLOUDINARY_IMAGE_ORIGIN,
  RICHTEXT_TEXT_ALIGNMENTS,
  RICHTEXT_TEXT_COLOR_HEXES,
} from '@/configs/Security.constants';

/**
 * Richtext allowlist for rendering (SPEC D13, render part). It mirrors the
 * storage-side config in apps/cms-api/src/modules/content-engine/domain/
 * field-types/RichtextSanitizer.rules.ts: same tags, link attributes,
 * URL schemes, palette colour on span, alignment on p/h1-h6 and img rules
 * (D13). Change both together.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'span',
  'img',
];
// Allowed per element, by isTagKept, not for the whole document.
const CONDITIONAL_TAGS = ['SPAN', 'IMG'];
const ALIGNABLE_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
const ATTRIBUTES_BY_TAG: Record<string, readonly string[]> = {
  A: ['href', 'title', 'target', 'rel'],
  SPAN: ['style'],
  IMG: ['src', 'alt', 'data-media-id'],
  ...Object.fromEntries(ALIGNABLE_TAGS.map((tag) => [tag, ['style']])),
};
const ALLOWED_ATTRIBUTES = [...new Set(Object.values(ATTRIBUTES_BY_TAG).flat())];
const ALLOWED_URL_SCHEMES = ['http', 'https', 'mailto', 'tel'];

// DOMPurify's own default shape (scheme list, or a relative URL), narrowed to
// the cms-api schemes.
const ALLOWED_URL_PATTERN = new RegExp(
  `^(?:(?:${ALLOWED_URL_SCHEMES.join('|')}):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`,
  'i',
);

// Browsers drop tabs and newlines and read a backslash as a slash, so these all
// mean "another host"; sanitize-html normalizes the same way.
const LAST_IGNORED_CHAR_CODE = 0x20;
const PROTOCOL_RELATIVE_URL = /^[/\\]{2}/;
const NEW_TAB_LINK_REL = 'noopener noreferrer';

// Longest `style` value read; longer ones are dropped, which also bounds regex work.
const MAX_STYLE_LENGTH = 64;
const PALETTE_HEXES: ReadonlySet<string> = new Set(RICHTEXT_TEXT_COLOR_HEXES);
const COLOR_STYLE = /^\s*color\s*:\s*(#[0-9a-f]{6})\s*(?:;\s*)?$/i;
const ALIGN_STYLE = new RegExp(
  `^\\s*text-align\\s*:\\s*(${RICHTEXT_TEXT_ALIGNMENTS.join('|')})\\s*(?:;\\s*)?$`,
  'i',
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_ORIGIN = new URL(CLOUDINARY_IMAGE_ORIGIN).origin;

const CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
  ALLOWED_URI_REGEXP: ALLOWED_URL_PATTERN,
  // DOMPurify already discards script, style and noscript content.
  ADD_FORBID_CONTENTS: ['textarea', 'option'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

/** The sanitizer surface this file needs; a DOMPurify instance fits. */
type Purifier = Pick<typeof DOMPurify, 'sanitize' | 'addHook'>;

function withoutIgnoredChars(value: string | undefined): string | undefined {
  return value
    ?.split('')
    .filter((char) => char.charCodeAt(0) > LAST_IGNORED_CHAR_CODE)
    .join('');
}

function paletteColorOf(style: string | null): string | undefined {
  if (!style || style.length > MAX_STYLE_LENGTH) return undefined;
  const hex = COLOR_STYLE.exec(style)?.[1]?.toLowerCase();
  return hex && PALETTE_HEXES.has(hex) ? hex : undefined;
}

function alignmentOf(style: string | null): string | undefined {
  if (!style || style.length > MAX_STYLE_LENGTH) return undefined;
  return ALIGN_STYLE.exec(style)?.[1]?.toLowerCase();
}

/** The src must sit on the exact image origin (scheme and port included) with no credentials. */
function isAllowedImage(element: Element): boolean {
  const mediaId = element.getAttribute('data-media-id');
  if (!mediaId || !UUID.test(mediaId)) return false;
  try {
    const src = (element.getAttribute('src') ?? '').trim();
    const url = new URL(src);
    // The prefix check rejects `https:host/x` and `https:/host/x`, which parse as
    // absolute here but resolve against the page in a browser.
    return (
      !url.username &&
      !url.password &&
      url.origin === IMAGE_ORIGIN &&
      src.startsWith(`${IMAGE_ORIGIN}/`)
    );
  } catch {
    return false;
  }
}

/** A span without a palette colour and an img without a valid source are removed (a span keeps its text). */
function isTagKept(element: Element): boolean {
  switch (element.nodeName) {
    case 'SPAN':
      return paletteColorOf(element.getAttribute('style')) !== undefined;
    case 'IMG':
      return isAllowedImage(element);
    default:
      return true;
  }
}

function keepOnlyAllowedAttributes(node: Element): void {
  const allowed = ATTRIBUTES_BY_TAG[node.nodeName] ?? [];
  for (const { name } of Array.from(node.attributes)) {
    if (!allowed.includes(name)) node.removeAttribute(name);
  }
}

function normalizeStyle(node: Element): void {
  const style = node.getAttribute('style');
  const color = node.nodeName === 'SPAN' ? paletteColorOf(style) : undefined;
  const align = ALIGNABLE_TAGS.includes(node.nodeName) ? alignmentOf(style) : undefined;
  if (color) node.setAttribute('style', `color: ${color}`);
  else if (align) node.setAttribute('style', `text-align: ${align}`);
  else node.removeAttribute('style');
}

function normalizeImage(node: Element): void {
  const src = (node.getAttribute('src') ?? '').trim();
  const alt = node.getAttribute('alt');
  const mediaId = (node.getAttribute('data-media-id') ?? '').toLowerCase();
  for (const { name } of Array.from(node.attributes)) node.removeAttribute(name);
  node.setAttribute('src', src);
  if (alt !== null) node.setAttribute('alt', alt);
  node.setAttribute('data-media-id', mediaId);
}

function applyLinkRules(node: Element): void {
  const href = withoutIgnoredChars(node.getAttribute('href') ?? undefined);
  if (href !== undefined && PROTOCOL_RELATIVE_URL.test(href)) {
    node.removeAttribute('href');
  }
  if (node.hasAttribute('target')) {
    node.setAttribute('rel', NEW_TAB_LINK_REL);
  }
}

/** Adds the link, colour, alignment and image rules cms-api applies, then returns the same instance. */
export function withRichtextRules<T extends Purifier>(purifier: T): T {
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (node.nodeType !== 1 || !CONDITIONAL_TAGS.includes(node.nodeName)) return;
    data.allowedTags[data.tagName] = isTagKept(node as Element);
  });
  purifier.addHook('afterSanitizeAttributes', (node) => {
    keepOnlyAllowedAttributes(node);
    if (node.nodeName === 'A') applyLinkRules(node);
    if (node.hasAttribute('style')) normalizeStyle(node);
    if (node.nodeName === 'IMG') normalizeImage(node);
  });
  return purifier;
}

/** Sanitizes with an already prepared instance. */
export function sanitizeRichtextWith(purifier: Purifier, html: string): string {
  return purifier.sanitize(html, CONFIG);
}

let browserPurifier: Purifier | undefined;

/**
 * Browser sanitizer (and the one tests use under jsdom). On the Node server
 * use `sanitizeRichtextOnServer`, which brings its own DOM.
 */
export function sanitizeRichtext(html: string): string {
  if (!DOMPurify.isSupported) {
    throw new Error('sanitizeRichtext needs a DOM; use the server variant.');
  }
  browserPurifier ??= withRichtextRules(DOMPurify);
  return sanitizeRichtextWith(browserPurifier, html);
}
