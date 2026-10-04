# Onboarding and recovery

The public pages that get a user to their first sign-in and back in after a forgotten password: the
first-run redirect, register → verify OTP → sign in, and forgot → reset password. For new admins on
a fresh install and for users locked out of their account.

## Feature

### Flows

```
/login ──has-users=false──▶ /register ──201──▶ /verify-otp (email in state) ──200──▶ /login ("verified" notice)
/login ──"Forgot your password?"──▶ /forgot-password ──(email link)──▶ /reset-password?token=… ──200──▶ /login ("reset" notice)
```

| Page               | Behaviour |
| ------------------ | --------- |
| `/login`           | `GET /auth/has-users` `false` redirects to `/register` (AC-31); a failed check is ignored. Shows `state.notice` in `role="status"`. |
| `/register`        | "Set up admin account" when has-users is `false`, else "Create account". Client checks: name required; username 3–32 of `[a-zA-Z0-9_.-]`; valid email; password ≥ 8. Errors under each field (`aria-invalid`, `aria-describedby`). Sends `accountType: true`. 409 → "Email or username is already in use." Success → `/verify-otp` with `{ email }`. |
| `/verify-otp`      | Email (prefilled from state, editable) and a 6-digit code (`inputmode="numeric"`, `autocomplete="one-time-code"`). **Resend code** posts `/auth/resend-otp`. 400 invalid or expired, 404 no account, 409 already verified plus "Go to sign in", 429 too many attempts. Success → `/login` with the "verified" notice. |
| `/forgot-password` | Always shows "If that email exists, a reset link was sent." in `role="status"`, whatever the server answered, so it never reveals whether an account exists. |
| `/reset-password`  | Reads `?token` once into state, then replaces the history entry with `/reset-password` (no query, no new entry) so the token leaves the address bar, history and `Referer` (SEC-5). A reload after that shows "Link expired" (accepted trade-off). No token or a 400 → "Link expired" with "Request a new link". New password (≥ 8) plus confirmation. Success → `/login` with the "reset" notice. |

### Contract

All under `/api/v1`, public, rate-limited (429), sent with `skipAuthRefresh`.

| Endpoint (`authApi` hook)                                  | Body                                               | Success           | Errors handled         |
| ---------------------------------------------------------- | -------------------------------------------------- | ----------------- | ---------------------- |
| `GET /auth/has-users` (`useHasUsersQuery`)                 | —                                                  | `{ hasUsers }`    | ignored                |
| `POST /auth/register` (`useRegisterMutation`)              | `{ email, name, username, password, accountType }` | 201 `{ message }` | 409, 429               |
| `POST /auth/verify-otp` (`useVerifyOtpMutation`)           | `{ email, otp }`                                   | 200 `{ message }` | 400, 404, 409, 429     |
| `POST /auth/resend-otp` (`useResendOtpMutation`)           | `{ email }`                                        | 200 `{ message }` | 404, 409, 429          |
| `POST /auth/forgot-password` (`useForgotPasswordMutation`) | `{ email }`                                        | 200 `{ message }` | none shown             |
| `POST /auth/reset-password` (`useResetPasswordMutation`)   | `{ token, newPassword }`                           | 200 `{ message }` | 400 → "Link expired"   |

Any other error shows `ApiError.message`. No env vars of its own.

### Decisions

- **`has-users` is not cached once unused** (`keepUnusedDataFor: 0`), or the first visit's "no users"
  answer would bounce the new admin back to `/register` after verifying.
- **Forgot-password errors**: any HTTP answer shows the generic message; only status 0 (nothing
  reached the server) shows the connection error, because the generic text would then be false.
- **Verify-OTP email is editable**, for someone who opens the page directly.
- **Login links** to both flows, so they are reachable without typing URLs.
- **Known gap:** the token-bearing reset URL still sits in the original history entry and nginx
  access logs (H-SEC-2, see [Roadmap](./roadmap.md)).

## Files

| File                                             | Spec                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/features/auth/onboarding.ts`                | Exports `validateRegister`, `validateEmail`, `validateOtp`, `validateNewPassword`, `registerErrorMessage`, `verifyOtpErrorMessage`, `resendOtpErrorMessage`, `emailFromState`, `loginNoticeState`, `loginNoticeMessage`, `MIN_PASSWORD_LENGTH`, `RegisterForm`, `RegisterErrors`, `LoginNotice`. Pure validation, messages and router-state helpers. |
| `src/pages/register/RegisterPage.tsx`            | Default export `RegisterPage`: first-run or normal registration.                             |
| `src/pages/verify-otp/VerifyOtpPage.tsx`         | Default export `VerifyOtpPage`: code entry and resend.                                       |
| `src/pages/forgot-password/ForgotPasswordPage.tsx` | Default export `ForgotPasswordPage`: non-revealing reset request.                          |
| `src/pages/reset-password/ResetPasswordPage.tsx` | Default export `ResetPasswordPage`: reads and strips the token, sets the new password.      |

The endpoints live in `src/core/api/AuthApi.ts`, owned by [Auth session](./auth-session.md).

## Testing

- `src/features/auth/onboarding.test.ts`; the page tests next to each page (MSW, success and every
  error mapping). `handlers.ts` answers `has-users` with `true`; override it for the first-run case.
- `e2e/onboarding.spec.ts`: first run (register → resend → wrong code → verify → sign in), a 409 on
  register, forgot → reset → old password fails and new works, the generic forgot answer, "Link
  expired" for a missing or unknown token, the token strip (no query, `history.length` unchanged) and
  "Link expired" after a reload.
- `mockApi` models register (409 when taken; the first user gets `ROLES.superAdmin`), verify-otp
  (code `OTP_CODE` = `123456`), resend-otp, forgot-password (stores a token, read with
  `mockApi.resetTokenFor(email)`) and reset-password (400 for an unknown or used token).
- Run: `pnpm --filter cms-admin exec vitest run src/pages/register src/pages/verify-otp src/pages/forgot-password src/pages/reset-password src/features/auth/onboarding.test.ts`
  and `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/onboarding.spec.ts`.

## Related

- [Auth session](./auth-session.md) (`authApi`)
- [Routing and guards](./routing-and-guards.md) (login page, routes)
- [App shell](./app-shell.md) (`AuthLayout`)
