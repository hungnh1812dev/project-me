import sanitizeHtml from 'sanitize-html';

import {
  RICHTEXT_ALLOWED_URL_SCHEMES,
  RICHTEXT_TEXT_ALIGNMENTS,
  RICHTEXT_TEXT_COLORS,
} from '../ContentEngine.constants';

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
  'span',
  'img',
];

/** Tags whose inner text is dropped together with the tag. */
const DISCARD_CONTENT_TAGS = ['script', 'style', 'textarea', 'option', 'noscript'];

/** A tag that is not allowed, so `discard` mode drops the tag and keeps its text. */
const UNWRAPPED_TAG = 'unwrapped';

const ALIGNABLE_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const PALETTE_HEXES: ReadonlySet<string> = new Set(
  RICHTEXT_TEXT_COLORS.flatMap((color) => (color.hex ? [color.hex] : [])),
);
/** Longest `style` value read; longer ones are dropped, which also bounds regex work. */
const MAX_STYLE_LENGTH = 64;
const COLOR_STYLE = /^\s*color\s*:\s*(#[0-9a-f]{6})\s*(?:;\s*)?$/i;
const ALIGN_STYLE = new RegExp(
  `^\\s*text-align\\s*:\\s*(${RICHTEXT_TEXT_ALIGNMENTS.join('|')})\\s*(?:;\\s*)?$`,
  'i',
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RichtextSanitizeContext {
  /** Origins (`https://host`, or `http://host:port` for the local provider) an `img` src must match exactly; none = no image is kept. */
  readonly imageOrigins?: readonly string[] | undefined;
}

function withoutStyle(attribs: sanitizeHtml.Attributes): sanitizeHtml.Attributes {
  const { style: _style, ...rest } = attribs;
  return rest;
}

function paletteColorOf(style: string | undefined): string | undefined {
  const hex =
    style && style.length <= MAX_STYLE_LENGTH
      ? COLOR_STYLE.exec(style)?.[1]?.toLowerCase()
      : undefined;
  return hex && PALETTE_HEXES.has(hex) ? hex : undefined;
}

/** Schemes a configured image origin may have; the src must match the origin exactly, scheme included. */
const IMAGE_ORIGIN_PROTOCOLS: ReadonlySet<string> = new Set(['https:', 'http:']);

function isAllowedImageSrc(src: string | undefined, origins: ReadonlySet<string>): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src.trim());
  } catch {
    return false;
  }
  return !url.username && !url.password && origins.has(url.origin);
}

function toOriginSet(origins: readonly string[] = []): ReadonlySet<string> {
  const result = new Set<string>();
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (IMAGE_ORIGIN_PROTOCOLS.has(url.protocol)) result.add(url.origin);
    } catch {
      // a malformed configured origin allows nothing
    }
  }
  return result;
}

function buildOptions(context: RichtextSanitizeContext): sanitizeHtml.IOptions {
  const origins = toOriginSet(context.imageOrigins);
  const transformTags: sanitizeHtml.IOptions['transformTags'] = {
    // Links that open a new tab must not leak window.opener.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
    }),
    span: (tagName, attribs) => {
      const hex = paletteColorOf(attribs.style);
      return hex
        ? { tagName, attribs: { style: `color: ${hex}` } }
        : { tagName: UNWRAPPED_TAG, attribs: {} };
    },
    img: (tagName, attribs) => {
      const src = attribs.src?.trim();
      const mediaId = attribs['data-media-id'];
      if (!src || !isAllowedImageSrc(src, origins) || !mediaId || !UUID.test(mediaId)) {
        return { tagName, attribs: {} };
      }
      const kept: sanitizeHtml.Attributes = { src };
      if (attribs.alt !== undefined) kept.alt = attribs.alt;
      kept['data-media-id'] = mediaId.toLowerCase();
      return { tagName, attribs: kept };
    },
  };
  for (const tag of ALIGNABLE_TAGS) {
    transformTags[tag] = (tagName, attribs) => {
      const align =
        attribs.style && attribs.style.length <= MAX_STYLE_LENGTH
          ? ALIGN_STYLE.exec(attribs.style)?.[1]?.toLowerCase()
          : undefined;
      return {
        tagName,
        attribs: align ? { style: `text-align: ${align}` } : withoutStyle(attribs),
      };
    };
  }
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      span: ['style'],
      img: ['src', 'alt', 'data-media-id'],
      ...Object.fromEntries(ALIGNABLE_TAGS.map((tag) => [tag, ['style']])),
    },
    allowedSchemes: [...RICHTEXT_ALLOWED_URL_SCHEMES],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    // transformTags already rewrote every style to its canonical form; the library's own rewrite would drop the space.
    parseStyleAttributes: false,
    disallowedTagsMode: 'discard',
    nonTextTags: DISCARD_CONTENT_TAGS,
    transformTags,
    // An img that failed the origin or media-id rule has no src left: drop it.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  };
}

export function sanitizeRichtext(html: string, context: RichtextSanitizeContext = {}): string {
  return sanitizeHtml(html, buildOptions(context));
}
