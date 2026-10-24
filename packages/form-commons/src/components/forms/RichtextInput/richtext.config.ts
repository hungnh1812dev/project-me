import StarterKit from '@tiptap/starter-kit';

import { RICHTEXT_LINK_PROTOCOLS } from '@/constants/richtext.constants';
import { CSP_NONCE_META_NAME } from '@/constants/security.constants';

/**
 * Tiptap injects its base CSS as a <style>; under a nonce-based `style-src` it
 * needs the page's nonce, which the host app publishes in this meta tag.
 */
const CSP_NONCE_META_SELECTOR = `meta[name="${CSP_NONCE_META_NAME}"]`;

export function readCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const content = document
    .querySelector(CSP_NONCE_META_SELECTOR)
    ?.getAttribute('content');
  return content || undefined;
}

/** What an empty Tiptap document serializes to. */
const EMPTY_DOC_HTML = '<p></p>';

/**
 * Extensions kept to what cms-api `sanitizeRichtext` allows: paragraphs,
 * line breaks, rules, bold/italic/underline/strike, code, quotes, headings,
 * lists and links. Add a tag here only after adding it to the server list.
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
];

/** Empty editor content is stored as '' (no value), not '<p></p>'. */
export function normalizeRichtextHtml(html: string): string {
  return html === EMPTY_DOC_HTML ? '' : html;
}
