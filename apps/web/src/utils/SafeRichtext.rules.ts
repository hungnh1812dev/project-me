import DOMPurify, { type Config } from 'dompurify';

/**
 * Richtext allowlist for rendering (SPEC D13, render part). It mirrors the
 * storage-side config in apps/cms-api/src/modules/content-engine/domain/
 * field-types/RichtextSanitizer.rules.ts: same tags, same link attributes,
 * same URL schemes. Change both together.
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
];
const ALLOWED_ATTRIBUTES = ['href', 'title', 'target', 'rel'];
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

/** Adds the link rules cms-api applies, then returns the same instance. */
export function withRichtextLinkRules<T extends Purifier>(purifier: T): T {
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const href = withoutIgnoredChars(node.getAttribute('href') ?? undefined);
    if (href !== undefined && PROTOCOL_RELATIVE_URL.test(href)) {
      node.removeAttribute('href');
    }
    if (node.hasAttribute('target')) {
      node.setAttribute('rel', NEW_TAB_LINK_REL);
    }
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
  browserPurifier ??= withRichtextLinkRules(DOMPurify);
  return sanitizeRichtextWith(browserPurifier, html);
}
