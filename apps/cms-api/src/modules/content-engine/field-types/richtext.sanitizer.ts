import sanitizeHtml from 'sanitize-html';

import { RICHTEXT_ALLOWED_URL_SCHEMES } from '../content-engine.constants';

/**
 * Cleans richtext HTML before it is stored (SPEC D13, storage part).
 * Allowlist only: anything not listed (script, style, iframe, event handler
 * attributes, javascript:/data: URLs, ...) is dropped. The web sanitizes
 * again when rendering. Tags match what the Tiptap editor can produce.
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

/** Tags whose inner text is dropped together with the tag. */
const DISCARD_CONTENT_TAGS = [
  'script',
  'style',
  'textarea',
  'option',
  'noscript',
];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
  allowedSchemes: [...RICHTEXT_ALLOWED_URL_SCHEMES],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: DISCARD_CONTENT_TAGS,
  transformTags: {
    // Links that open a new tab must not leak window.opener.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target
        ? { ...attribs, rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
};

export function sanitizeRichtext(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
