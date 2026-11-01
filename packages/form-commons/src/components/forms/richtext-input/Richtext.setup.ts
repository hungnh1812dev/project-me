import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle as BaseTextStyle, Color } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';

import { RICHTEXT_LINK_PROTOCOLS, RICHTEXT_TEXT_COLORS } from '@/constants/Richtext.constants';
import { CSP_NONCE_META_NAME } from '@/constants/Security.constants';

/**
 * Tiptap injects its base CSS as a <style>; under a nonce-based `style-src` it
 * needs the page's nonce, which the host app publishes in this meta tag.
 */
const CSP_NONCE_META_SELECTOR = `meta[name="${CSP_NONCE_META_NAME}"]`;

export function readCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const content = document.querySelector(CSP_NONCE_META_SELECTOR)?.getAttribute('content');
  return content || undefined;
}

/** What an empty Tiptap document serializes to. */
const EMPTY_DOC_HTML = '<p></p>';

const PALETTE_HEXES: readonly string[] = RICHTEXT_TEXT_COLORS.flatMap((color) =>
  color.hex ? [color.hex] : [],
);
const RGB_COLOR = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

/** The palette hex a CSS colour stands for (`#rrggbb` or `rgb(...)`), or null for any other colour. */
export function paletteHexOf(cssColor: string | null | undefined): string | null {
  const value = cssColor?.trim().toLowerCase();
  if (!value) return null;
  const rgb = RGB_COLOR.exec(value);
  const hex = rgb
    ? `#${rgb
        .slice(1, 4)
        .map((channel) => Number(channel).toString(16).padStart(2, '0'))
        .join('')}`
    : value;
  return PALETTE_HEXES.includes(hex) ? hex : null;
}

/**
 * ProseMirror assigns a `style` attribute through the CSSOM, which turns `#rrggbb` into
 * `rgb(...)`; the server reads only the hex form, so the span is built with `setAttribute`.
 */
const TextStyle = BaseTextStyle.extend({
  renderHTML({ HTMLAttributes }) {
    const span = document.createElement('span');
    Object.entries(HTMLAttributes as Record<string, string>).forEach(([name, value]) =>
      span.setAttribute(name, value),
    );
    return { dom: span, contentDOM: span };
  },
});

/** Text colour limited to the palette; written as `color: #rrggbb`, read back as the same hex. */
const PaletteTextColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element: HTMLElement) => paletteHexOf(element.style.color),
            renderHTML: (attributes: { color?: string | null }) => {
              const hex = paletteHexOf(attributes.color);
              return hex ? { style: `color: ${hex}` } : {};
            },
          },
        },
      },
    ];
  },
});

/** An image is always a File Library reference, so it carries its media id. */
const MediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-media-id'),
        renderHTML: (attributes: { mediaId?: string | null }) =>
          attributes.mediaId ? { 'data-media-id': attributes.mediaId } : {},
      },
    };
  },
});

/**
 * Extensions kept to what cms-api `sanitizeRichtext` allows: paragraphs,
 * line breaks, rules, bold/italic/underline/strike, code, quotes, headings,
 * lists, links, palette text colour, library images, and `text-align` on paragraphs and headings. Add a tag here only after adding it to the server list.
 */
export const richtextExtensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: false,
      protocols: RICHTEXT_LINK_PROTOCOLS,
      HTMLAttributes: { class: null, target: null, rel: null },
    },
    codeBlock: { HTMLAttributes: { class: null } },
  }),
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
  TextStyle,
  PaletteTextColor,
  MediaImage.configure({ inline: true }),
];

/** Empty editor content is stored as '' (no value), not '<p></p>'. */
export function normalizeRichtextHtml(html: string): string {
  return html === EMPTY_DOC_HTML ? '' : html;
}
