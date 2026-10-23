import { z } from 'zod';

import { parseRequest } from '../../../common/http/request-parsing';
import { PRESENCE_STATES, type PresenceState } from '../documents.constants';

const presenceBodySchema = z.strictObject({
  state: z.enum(PRESENCE_STATES).default('editing'),
});

/** `POST .../presence` body: `{ state? }`, nothing else (default `editing`). */
export function parsePresenceBody(body: unknown): PresenceState {
  return parseRequest(presenceBodySchema, body ?? {}).state;
}
