// Response and request shapes for the settings pages (SPEC "Backend contract"). `Role` is reused
// from `@/features/auth/types`.

/** `UserResponseDto` from U1–U3. */
export interface User {
  documentId: string;
  email: string;
  name: string;
  username: string;
  accountType: boolean;
  verified: boolean;
  roleId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `PermissionResponseDto` from P1–P3. */
export interface Permission {
  documentId: string;
  /** `resource:action[:scope]`. */
  slug: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

/** P4's 409 body: the permission is still referenced. */
export interface PermissionConflict {
  message: string;
  roleCount: number;
  accessTokenCount: number;
}

/** `AccessTokenResponseDto` from T1. Never carries the secret. */
export interface AccessToken {
  documentId: string;
  name: string;
  permissions: string[];
  /** ISO date, or `null` for a token that never expires. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

/** `AccessTokenSecretResponseDto` from T2 and T3: the token plus its plaintext secret, shown once. */
export interface AccessTokenSecret extends AccessToken {
  token: string;
}

/** `MediaAssetResponseDto` from M1 and M2. */
export interface MediaAsset {
  documentId: string;
  fileName: string;
  /** Sniffed from the bytes by the server. */
  mimeType: string;
  /** Bytes. */
  size: number;
  width: number;
  height: number;
  url: string;
  thumbnailUrl: string;
  publicId: string;
  /** SHA-256. */
  hash: string;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The token lifetimes T2 accepts, with their labels. `1m` is one month (D6, not yet checked). */
export const EXPIRES_IN_OPTIONS = [
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1m', label: '1 month' },
  { value: '1y', label: '1 year' },
  { value: 'never', label: 'Never' },
] as const;

export type ExpiresIn = (typeof EXPIRES_IN_OPTIONS)[number]['value'];

/** The label of one `expiresIn` value, for example "1 month". */
export function expiresInLabel(value: ExpiresIn): string {
  return EXPIRES_IN_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
