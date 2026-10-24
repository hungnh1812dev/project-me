import { useQuery } from '@tanstack/react-query';

import { FormAlert } from '@abyss/form-commons';
import { PRESENCE_HEARTBEAT_MS } from '../../config/content.constants';
import { COPY } from '../../config/copy.constants';
import { useCurrentUser } from '../auth';
import { useContentApi } from './content-api-context';
import type { PresenceEntry } from './content.api';

const copy = COPY.content.presence;
const PAIR = 2;

function message(others: PresenceEntry[]): string {
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
export function PresenceBanner({
  slug,
  documentId,
}: {
  slug: string;
  documentId: string;
}) {
  const api = useContentApi();
  const me = useCurrentUser();
  const presence = useQuery({
    queryKey: ['content', 'presence', slug, documentId],
    queryFn: () => api.sendPresence(slug, documentId),
    refetchInterval: PRESENCE_HEARTBEAT_MS,
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
  });
  const others = (presence.data ?? []).filter(
    (entry) => entry.accountId !== me?.id,
  );
  if (others.length === 0) return null;
  return <FormAlert tone="info">{message(others)}</FormAlert>;
}
