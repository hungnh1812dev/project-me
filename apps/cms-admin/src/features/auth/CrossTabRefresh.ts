/** Minimal Web Locks surface (`navigator.locks`), so tests can fake it. */
export interface RefreshLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Minimal BroadcastChannel surface. */
export interface RefreshChannel {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
}

export interface CrossTabRefreshOptions {
  /** Missing (old browser, tests): no cross-tab lock, per-tab refresh only. */
  locks?: RefreshLocks | undefined;
  /** Missing: tabs still take turns, but each refreshes for itself. */
  channel?: RefreshChannel | undefined;
  lockName: string;
  now?: () => number;
}

const REFRESHED_MESSAGE = 'refreshed';

interface RefreshedMessage {
  type: typeof REFRESHED_MESSAGE;
  accessToken: string;
  /** Epoch ms when the sending tab got the token. */
  at: number;
}

function isRefreshedMessage(data: unknown): data is RefreshedMessage {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Partial<RefreshedMessage>;
  return (
    message.type === REFRESHED_MESSAGE &&
    typeof message.accessToken === 'string' &&
    typeof message.at === 'number'
  );
}

/**
 * Coordinates refreshes across admin tabs (D9: reuse of a rotated token
 * revokes the family). The refresh cookie is shared by all tabs and rotates
 * on use, so tabs take turns under a Web Lock: a tab that waited reuses the token another tab got after it asked
 * (shared over BroadcastChannel) instead of sending a refresh of its own.
 * If that message comes late, the waiting tab refreshes with the already
 * rotated cookie, which is a normal rotation, not reuse. Without Web Locks
 * each tab refreshes for itself and the server's grace window covers the
 * overlap.
 */
export function createCrossTabRefresh(
  refresh: () => Promise<string>,
  { locks, channel, lockName, now = Date.now }: CrossTabRefreshOptions,
): () => Promise<string> {
  if (locks === undefined) return refresh;

  let shared: { accessToken: string; at: number } | null = null;
  channel?.addEventListener('message', ({ data }) => {
    if (isRefreshedMessage(data)) {
      shared = { accessToken: data.accessToken, at: data.at };
    }
  });

  return () => {
    const requestedAt = now();
    return locks.request(lockName, async () => {
      // Another tab refreshed after this one asked: use its token.
      if (shared !== null && shared.at >= requestedAt) {
        return shared.accessToken;
      }
      const accessToken = await refresh();
      const message: RefreshedMessage = {
        type: REFRESHED_MESSAGE,
        accessToken,
        at: now(),
      };
      channel?.postMessage(message);
      return accessToken;
    });
  };
}

/** The browser's Web Locks and BroadcastChannel, where they exist. */
export function browserCrossTabOptions(
  lockName: string,
  channelName: string,
): CrossTabRefreshOptions {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks as
    RefreshLocks | undefined;
  // A channel is only useful with the lock (and would keep tests alive).
  const channel =
    locks !== undefined && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(channelName)
      : undefined;
  return { locks, channel, lockName };
}
