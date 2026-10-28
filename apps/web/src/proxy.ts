import { NextResponse, type NextRequest } from 'next/server';

import { appEnv } from './config/Browser.env';
import { CSP_HEADER, NONCE_HEADER } from './config/Security.constants';
import {
  buildContentSecurityPolicy,
  generateNonce,
} from './lib/ContentSecurityPolicy.rules';

/**
 * Per-request CSP nonce (SPEC D17). Next.js reads the nonce from the request's
 * CSP header while rendering and stamps it on its own scripts, so the header
 * goes on the forwarded request as well as the response.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    apiBaseUrl: appEnv.apiBaseUrl,
    isDev: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

/**
 * Everything except API calls (served by cms-api) and build assets; prefetches
 * carry no document, so they get no nonce. Must stay a static literal.
 */
export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
