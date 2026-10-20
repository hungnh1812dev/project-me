import { expect, type BrowserContext } from '@playwright/test';

import {
  MAIL_POLL_INTERVAL_MS,
  MAIL_WAIT_TIMEOUT_MS,
  MAILPIT_API,
  OTP_IN_MAIL,
} from './constants';
import { e2eEnv } from './env';

interface MailpitSummary {
  ID: string;
}

interface MailpitSearch {
  messages: MailpitSummary[];
}

interface MailpitMessage {
  Text: string;
}

/**
 * Reads Mailpit's API through a browser tab: Chromium resolves
 * `*.localhost` to loopback by itself, so no hosts entry is needed.
 */
async function getJson<T>(context: BrowserContext, path: string): Promise<T> {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${e2eEnv.mailpitUrl}${path}`);
    if (response === null || !response.ok()) {
      throw new Error(`Mailpit ${path} answered ${response?.status()}`);
    }
    return (await response.json()) as T;
  } finally {
    await page.close();
  }
}

/** IDs of the messages Mailpit holds for `email` right now. */
export async function mailIdsFor(
  context: BrowserContext,
  email: string,
): Promise<Set<string>> {
  const query = encodeURIComponent(`to:"${email}"`);
  const result = await getJson<MailpitSearch>(
    context,
    `${MAILPIT_API.SEARCH}?query=${query}`,
  );
  return new Set(result.messages.map((message) => message.ID));
}

/**
 * Waits for a message to `email` that is not in `seen` and returns the OTP
 * code in it.
 */
export async function waitForCode(
  context: BrowserContext,
  email: string,
  seen: ReadonlySet<string>,
): Promise<string> {
  let newId: string | undefined;
  await expect
    .poll(
      async () => {
        const ids = await mailIdsFor(context, email);
        newId = [...ids].find((id) => !seen.has(id));
        return newId;
      },
      {
        timeout: MAIL_WAIT_TIMEOUT_MS,
        intervals: [MAIL_POLL_INTERVAL_MS],
      },
    )
    .toBeDefined();
  const message = await getJson<MailpitMessage>(
    context,
    `${MAILPIT_API.MESSAGE}/${newId}`,
  );
  const code = OTP_IN_MAIL.exec(message.Text)?.[1];
  if (code === undefined) throw new Error('No code in the OTP email');
  return code;
}
