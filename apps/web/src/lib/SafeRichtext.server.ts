import 'server-only';

import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

import {
  sanitizeRichtextWith,
  withRichtextLinkRules,
} from './SafeRichtext.rules';

// Kept out of SafeRichtext.rules.ts so that jsdom never reaches a client chunk.
let serverPurifier: ReturnType<typeof createDOMPurify> | undefined;

/** Server-side sanitizer: DOMPurify over a jsdom window. */
export function sanitizeRichtextOnServer(html: string): string {
  serverPurifier ??= withRichtextLinkRules(
    createDOMPurify(new JSDOM('').window),
  );
  return sanitizeRichtextWith(serverPurifier, html);
}
