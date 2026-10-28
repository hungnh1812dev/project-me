import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Filled by the init script below; one line per reported CSP violation. */
    __cspViolations: string[];
  }
}

const CSP_CONSOLE_PATTERN = /content security policy|unsafe-eval/i;

/**
 * Records CSP violations of the page: `securitypolicyviolation` events (init
 * script, so it survives reloads and navigations) and CSP console errors.
 */
export async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sample}`,
      );
    });
  });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (CSP_CONSOLE_PATTERN.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  return async () => {
    const events = await page.evaluate(() => window.__cspViolations);
    return [...events, ...consoleErrors];
  };
}

export async function expectNoViolation(
  read: () => Promise<string[]>,
  where: string,
): Promise<void> {
  expect(await read(), `CSP violations on ${where}`).toEqual([]);
}
