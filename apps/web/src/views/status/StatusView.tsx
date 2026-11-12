'use client';

import { Button } from '@abyss/form-commons';

import { BFF_BASE_PATH, BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { LAST_RESORT_TEXT } from '@/features/site-shell';
import type { StatusPageText } from '@/features/status/StatusPage.graphql';

import { useLiveHealth, type LiveHealthState } from './useLiveHealth';

const BADGE_TONE: Record<LiveHealthState, string> = {
  checking: 'bg-muted text-muted-foreground',
  ok: 'bg-success-soft text-success-strong',
  error: 'bg-destructive-soft text-destructive-strong',
};

const DOT_TONE: Record<LiveHealthState, string> = {
  checking: 'bg-muted-foreground',
  ok: 'bg-success',
  error: 'bg-destructive',
};

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

/** The words the card shows when the page text could not load. */
const LAST_RESORT_CARD_TEXT = {
  stateChecking: LAST_RESORT_TEXT.statusChecking,
  stateOk: LAST_RESORT_TEXT.statusOperational,
  stateError: LAST_RESORT_TEXT.statusUnreachable,
  checkAgain: LAST_RESORT_TEXT.statusCheckAgain,
} as const;

const HEALTH_PATH = `${BFF_BASE_PATH}${BFF_ENDPOINTS.HEALTH}`;

function StatusCard({ text }: { text: StatusPageText | null }) {
  const { state, isFetching, lastCheckedAt, refetch } = useLiveHealth();
  const words = text ?? LAST_RESORT_CARD_TEXT;
  const stateWord = { checking: words.stateChecking, ok: words.stateOk, error: words.stateError }[
    state
  ];

  return (
    <section
      aria-labelledby={text ? 'api-status-title' : undefined}
      aria-label={text ? undefined : stateWord}
      className="border-border bg-card text-card-foreground rounded-md border"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4">
        {text ? (
          <div className="min-w-0">
            <h2 id="api-status-title" className="text-base font-semibold">
              {text.cardTitle}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">{text.cardDescription}</p>
          </div>
        ) : null}
        <output
          className={`inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-medium ${BADGE_TONE[state]}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT_TONE[state]}`} />
          {stateWord}
        </output>
      </div>

      {text ? (
        <dl className="border-border grid grid-cols-1 gap-x-6 gap-y-1 border-t px-5 py-4 text-sm sm:grid-cols-[max-content_1fr] sm:gap-y-3">
          <dt className="text-muted-foreground">{text.endpointLabel}</dt>
          <dd className="mb-2 font-mono text-xs break-all sm:mb-0 sm:text-sm">GET {HEALTH_PATH}</dd>
          <dt className="text-muted-foreground">{text.lastCheckedLabel}</dt>
          <dd className="tabular-nums">
            {lastCheckedAt ? (
              <time dateTime={lastCheckedAt.toISOString()}>{timeFormat.format(lastCheckedAt)}</time>
            ) : (
              text.notCheckedYet
            )}
          </dd>
        </dl>
      ) : null}

      {state === 'error' && text ? (
        <p
          role="alert"
          className="bg-destructive-soft text-destructive-strong mx-5 mb-4 rounded-md px-3 py-2 text-sm"
        >
          {text.errorHint}
        </p>
      ) : null}

      <div className="border-border flex justify-end border-t px-5 py-3">
        <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>
          {words.checkAgain}
        </Button>
      </div>
    </section>
  );
}

/** `text` is `null` when the page text could not load: the card then keeps only its last-resort words. */
export function StatusView({ text }: { text: StatusPageText | null }) {
  return (
    <>
      {text ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{text.title}</h1>
          <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.description}</p>
        </>
      ) : null}
      <div className={text ? 'mt-8' : undefined}>
        <StatusCard text={text} />
      </div>
    </>
  );
}
