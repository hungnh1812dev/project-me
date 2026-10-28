/** Where a refresh token was issued from (stored for session listings). */
export interface ClientMeta {
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
}
