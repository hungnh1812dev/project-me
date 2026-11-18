import { FormAlert } from '@abyss/form-commons';
import { useScreenText, type ScreenText } from '@configs/locales';
import { useCurrentUser } from '@features/auth';
import type { PresenceEntry } from '@features/content/Content.api';
import { PRESENCE_HEARTBEAT_MS } from '@features/content/Content.constants';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { useContentApi } from '@features/content/ContentApi.context';
import { useQuery } from '@tanstack/react-query';

const PAIR = 2;

function message(
  others: PresenceEntry[],
  copy: ScreenText<'content'>['content']['presence'],
): string {
  const names = others.map((entry) => entry.displayName);
  if (names.length === 1) return copy.one(names[0] ?? '');
  if (names.length === PAIR) return copy.two(names[0] ?? '', names[1] ?? '');
  return copy.many(names[0] ?? '', names[1] ?? '', names.length - PAIR);
}

/**
 * Sends a presence heartbeat every 20 s while mounted (SPEC D16) and tells
 * the editor who else is on the document. Polling stops on unmount. A failed
 * heartbeat just hides the banner: presence is a hint, never a blocker.
 */
export function PresenceBanner({ slug, documentId }: { slug: string; documentId: string }) {
  const copy = useScreenText('content').content.presence;
  const api = useContentApi();
  const me = useCurrentUser();
  const presence = useQuery({
    queryKey: CONTENT_QUERY_KEYS.presence(slug, documentId),
    queryFn: () => api.sendPresence(slug, documentId),
    refetchInterval: PRESENCE_HEARTBEAT_MS,
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
  });
  const others = (presence.data ?? []).filter((entry) => entry.accountId !== me?.id);
  if (others.length === 0) return null;
  return <FormAlert tone="info">{message(others, copy)}</FormAlert>;
}
