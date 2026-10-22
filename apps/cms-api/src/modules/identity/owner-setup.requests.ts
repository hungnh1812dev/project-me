import { parseRequest } from '../access/access-management.requests';
import { ownerInputSchema, type OwnerBootstrapInput } from './owner-bootstrap';

/** The setup token is read apart (it is checked before anything else). */
export function parseOwnerSetupBody(body: unknown): OwnerBootstrapInput {
  return parseRequest(ownerInputSchema, body);
}

/** The submitted token, if the body carries a non-empty string under it. */
export function submittedSetupToken(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  return (body as Record<string, unknown>).setupToken;
}

/** True when the body names a non-empty `setupToken`; decides if a closed submit is audited. */
export function carriesSetupToken(body: unknown): boolean {
  const token = submittedSetupToken(body);
  return typeof token === 'string' && token !== '';
}
