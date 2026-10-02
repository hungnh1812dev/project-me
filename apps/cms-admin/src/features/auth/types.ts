/** `RoleResponseDto` from `GET /auth/me`. Roles are dynamic: never hardcode a role list. */
export interface Role {
  documentId: string;
  name: string;
  slug: string;
  /** Flat `resource:action[:scope]` permission slugs. */
  permissions: string[];
  /** 0–100, admin-configurable. Seeded: super_admin 100, admin 50, editor 20, guest 0. */
  level: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

/** `MeResponseDto` from `GET /auth/me`. */
export interface MeUser {
  documentId: string;
  email: string;
  name: string;
  username: string;
  accountType: boolean;
  verified: boolean;
  roleId: string | null;
  createdAt: string;
  updatedAt: string;
  role: Role | null;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

/** The Redux `auth` slice. Memory only: never persisted to any web storage. */
export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: MeUser | null;
  error: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/** `POST /auth/login` and `POST /auth/refresh` response body. */
export interface TokenResponse {
  message: string;
  accessToken: string;
}

export interface MessageResponse {
  message: string;
}

export interface HasUsersResponse {
  hasUsers: boolean;
}

/** `POST /auth/register`. `accountType: true` as the legacy UI sent (SPEC Assumption 3). */
export interface RegisterRequest {
  email: string;
  name: string;
  username: string;
  password: string;
  accountType: boolean;
}

/** `POST /auth/verify-otp`. */
export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

/** `POST /auth/resend-otp` and `POST /auth/forgot-password`. */
export interface EmailRequest {
  email: string;
}

/** `POST /auth/reset-password`. */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
