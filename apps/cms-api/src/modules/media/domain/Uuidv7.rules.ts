export const UUID_BYTES = 16;
const TIMESTAMP_BYTES = 6;
const BYTE_BITS = 8;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const VERSION_7 = 0x70;
const VERSION_MASK = 0x0f;
const VARIANT_RFC = 0x80;
const VARIANT_MASK = 0x3f;

/**
 * RFC 9562 UUID v7: a 48-bit millisecond timestamp followed by random bits,
 * so keys sort by creation time and are not guessable. The caller supplies
 * the time (`Clock`) and `UUID_BYTES` random bytes, which keeps this rule pure.
 */
export function uuidv7(nowMs: number, randomBytes: Uint8Array): string {
  const bytes = Buffer.from(randomBytes);
  let remaining = nowMs;
  for (let index = TIMESTAMP_BYTES - 1; index >= 0; index -= 1) {
    bytes[index] = remaining % (1 << BYTE_BITS);
    remaining = Math.floor(remaining / (1 << BYTE_BITS));
  }
  bytes[VERSION_BYTE] = ((bytes[VERSION_BYTE] ?? 0) & VERSION_MASK) | VERSION_7;
  bytes[VARIANT_BYTE] =
    ((bytes[VARIANT_BYTE] ?? 0) & VARIANT_MASK) | VARIANT_RFC;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
