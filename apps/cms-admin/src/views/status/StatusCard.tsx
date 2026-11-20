import { Button, Card } from '@abyss/form-commons';
import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { appEnv } from '@configs/App.env';
import { useScreenText } from '@configs/locales';
import { formatTime } from '@utils/DateFormat.rules';
import { Activity, AlertCircle, Clock, RefreshCw, Server } from 'lucide-react';

import { useLiveHealth, type LiveHealthState } from './useLiveHealth';

const BADGE_TONE: Record<LiveHealthState, string> = {
  checking: 'bg-muted text-muted-foreground border border-border/60',
  ok: 'bg-success-soft text-success-strong border border-success/30',
  error: 'bg-destructive-soft text-destructive-strong border border-destructive/30',
};

const DOT_TONE: Record<LiveHealthState, string> = {
  checking: 'bg-muted-foreground',
  ok: 'bg-success',
  error: 'bg-destructive',
};

export function StatusCard() {
  const { status } = useScreenText('status');
  const { state, isFetching, lastCheckedAt, refetch } = useLiveHealth();
  const endpoint = `${appEnv.apiBaseUrl}${API_ENDPOINTS.HEALTH.LIVE}`;

  return (
    <Card asChild padding="flush">
      <section
        aria-labelledby="api-status-title"
        className="overflow-hidden border border-border shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card/60 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex size-10 items-center justify-center rounded-control ${
                state === 'ok'
                  ? 'bg-success-soft text-success-strong ring-1 ring-success/30'
                  : state === 'error'
                    ? 'bg-destructive-soft text-destructive-strong ring-1 ring-destructive/30'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <Server aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 id="api-status-title" className="text-base font-semibold text-foreground">
                {status.cardTitle}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{status.cardDescription}</p>
            </div>
          </div>
          <output
            className={`inline-flex items-center gap-2 rounded-control px-3 py-1 text-xs font-semibold tracking-wide shadow-xs ${BADGE_TONE[state]}`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${DOT_TONE[state]} ${state === 'ok' ? 'animate-pulse' : ''}`}
            />
            {status.state[state]}
          </output>
        </div>

        <dl className="grid grid-cols-1 divide-y divide-border text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex flex-col justify-center px-6 py-4">
            <dt className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {status.endpointLabel}
            </dt>
            <dd className="mt-1.5 flex items-center gap-2 font-mono text-xs break-all text-foreground">
              <span className="inline-flex rounded-item bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                GET
              </span>
              <span className="truncate" title={endpoint}>
                {endpoint}
              </span>
            </dd>
          </div>
          <div className="flex flex-col justify-center px-6 py-4">
            <dt className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {status.lastCheckedLabel}
            </dt>
            <dd className="mt-1.5 flex items-center gap-2 text-xs font-medium text-foreground tabular-nums">
              <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
              {lastCheckedAt ? (
                <time dateTime={lastCheckedAt.toISOString()}>{formatTime(lastCheckedAt)}</time>
              ) : (
                status.notCheckedYet
              )}
            </dd>
          </div>
        </dl>

        {state === 'error' ? (
          <p
            role="alert"
            className="mx-6 mt-2 mb-4 flex items-center gap-2 rounded-control bg-destructive-soft px-4 py-2.5 text-xs font-medium text-destructive-strong"
          >
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {status.errorHint}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity aria-hidden="true" className="size-3.5 text-primary" />
            Live Health Monitoring
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={isFetching}
            onClick={() => void refetch()}
            className="shadow-xs"
          >
            <RefreshCw
              aria-hidden="true"
              className={`mr-1.5 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
            />
            {status.checkAgain}
          </Button>
        </div>
      </section>
    </Card>
  );
}
