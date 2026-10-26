import { argon2id, hash, verify } from 'argon2';

import { ARGON2_OPTIONS } from './domain/Identity.constants';

/** Argon2id hash in PHC string form (salt and parameters included). */
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, ...ARGON2_OPTIONS });
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}
