'use client';

import { Button } from '@abyss/form-commons';

import { COPY } from '../../config/copy.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import { appEnv } from '../../config/env.client';
import { type LiveHealthState, useLiveHealth } from './use-live-health';

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

export function StatusCard() {
  const { state, isFetching, lastCheckedAt, refetch } = useLiveHealth();
  const endpoint = `${appEnv.apiBaseUrl}${API_ENDPOINTS.HEALTH.LIVE}`;

  return (
    <section
      aria-labelledby="api-status-title"
      className="rounded-md border border-border bg-card text-card-foreground"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0">
          <h2 id="api-status-title" className="text-base font-semibold">
            {COPY.status.cardTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {COPY.status.cardDescription}
          </p>
        </div>
        <output
          className={`inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-medium ${BADGE_TONE[state]}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${DOT_TONE[state]}`}
          />
          {COPY.status.state[state]}
        </output>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border px-5 py-4 text-sm sm:grid-cols-[max-content_1fr] sm:gap-y-3">
        <dt className="text-muted-foreground">{COPY.status.endpointLabel}</dt>
        <dd className="mb-2 font-mono text-xs break-all sm:mb-0 sm:text-sm">
          GET {endpoint}
        </dd>
        <dt className="text-muted-foreground">
          {COPY.status.lastCheckedLabel}
        </dt>
        <dd className="tabular-nums">
          {lastCheckedAt ? (
            <time dateTime={lastCheckedAt.toISOString()}>
              {timeFormat.format(lastCheckedAt)}
            </time>
          ) : (
            COPY.status.notCheckedYet
          )}
        </dd>
      </dl>

      {state === 'error' ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive-strong"
        >
          {COPY.status.errorHint}
        </p>
      ) : null}

      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button
          variant="secondary"
          size="sm"
          loading={isFetching}
          onClick={() => void refetch()}
        >
          {COPY.status.checkAgain}
        </Button>
      </div>
    </section>
  );
}
