/// <reference types="node" />
// Pins apps/cms-admin/nginx.conf (an envsubst template) to buildContentSecurityPolicy (AC-9).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './csp';

const template = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

/**
 * Substitutes like the nginx image's envsubst step: only the names it is given (the
 * defined env vars) are replaced, so nginx variables such as `$uri` stay as they are.
 */
function envsubst(text: string, env: Record<string, string>): string {
  return text.replace(/\$\{(\w+)\}|\$(\w+)/g, (match, braced?: string, bare?: string) => {
    const name = braced ?? bare ?? '';
    return Object.hasOwn(env, name) ? env[name] : match;
  });
}

/** Returns the body of each `location <path> { ... }` block (no nested blocks in this file). */
function locations(conf: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of conf.matchAll(/location\s+(\S+)\s*\{([^}]*)\}/g)) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

/** The value of `add_header <name> "<value>" always;`, or undefined when absent or without `always`. */
function header(block: string, name: string): string | undefined {
  const match = new RegExp(`add_header\\s+${name}\\s+"([^"]*)"\\s+always\\s*;`).exec(block);
  return match?.[1];
}

const SAMPLE = {
  CSP_API_ORIGIN: 'https://api.example.test',
  CSP_IMG_ORIGINS: 'https://cdn.example.test https://media.example.test',
};
const SERVING_LOCATIONS = ['/', '/assets/'];

describe('nginx.conf template', () => {
  const rendered = locations(envsubst(template, SAMPLE));

  it('has the serving locations and the health check', () => {
    expect([...rendered.keys()].sort()).toEqual(['/', '/assets/', '/healthz']);
  });

  it.each(SERVING_LOCATIONS)(
    'sends the builder policy as Content-Security-Policy with always in %s',
    (path) => {
      expect(header(rendered.get(path) ?? '', 'Content-Security-Policy')).toBe(
        buildContentSecurityPolicy({
          apiOrigin: SAMPLE.CSP_API_ORIGIN,
          imgOrigins: SAMPLE.CSP_IMG_ORIGINS,
        }),
      );
    },
  );

  it.each(SERVING_LOCATIONS)('sends Referrer-Policy: same-origin with always in %s', (path) => {
    expect(header(rendered.get(path) ?? '', 'Referrer-Policy')).toBe('same-origin');
  });

  it('leaves the security headers off /healthz', () => {
    const healthz = rendered.get('/healthz') ?? '';
    expect(healthz).not.toMatch(/Content-Security-Policy|Referrer-Policy/);
  });

  it('gives a self-only policy when both variables are empty (the Dockerfile defaults)', () => {
    const empty = locations(envsubst(template, { CSP_API_ORIGIN: '', CSP_IMG_ORIGINS: '' }));
    for (const path of SERVING_LOCATIONS) {
      // Empty values leave extra spaces, which browsers ignore; compare normalized.
      const policy = (header(empty.get(path) ?? '', 'Content-Security-Policy') ?? '')
        .replace(/\s+/g, ' ')
        .replace(/ ;/g, ';');
      expect(policy).toBe(buildContentSecurityPolicy({ apiOrigin: '', imgOrigins: '' }));
    }
  });

  it('only references the two CSP variables, and keeps nginx $uri intact', () => {
    const envNames = [...template.matchAll(/\$\{(\w+)\}/g)].map((match) => match[1]);
    expect(new Set(envNames)).toEqual(new Set(['CSP_API_ORIGIN', 'CSP_IMG_ORIGINS']));
    const assets = rendered.get('/assets/') ?? '';
    const spa = rendered.get('/') ?? '';
    expect(assets).toContain('try_files $uri =404;');
    expect(spa).toContain('try_files $uri $uri/ /index.html;');
  });
});

describe('Dockerfile runner stage', () => {
  const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');

  it('copies nginx.conf as the envsubst template (AC-10)', () => {
    expect(dockerfile).toMatch(
      /^COPY apps\/cms-admin\/nginx\.conf \/etc\/nginx\/templates\/default\.conf\.template$/m,
    );
    expect(dockerfile).not.toMatch(/nginx\.conf \/etc\/nginx\/conf\.d\//);
  });

  it('defaults both CSP variables to empty (AC-10)', () => {
    expect(dockerfile).toMatch(/^ENV CSP_API_ORIGIN="" CSP_IMG_ORIGINS=""$/m);
  });
});
