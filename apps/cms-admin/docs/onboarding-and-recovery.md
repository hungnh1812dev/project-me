# Onboarding and recovery

The public pages that get a user to their first sign-in and back in after a forgotten password: the first-run redirect, register → verify OTP → sign in, and forgot → reset password. Like the other Phase 1 pages, they are unstyled semantic HTML that Phase 3 restyles.

Source: `src/pages/{register,verify-otp,forgot-password,reset-password}/`, `src/pages/login/LoginPage.tsx`, `src/features/auth/onboarding.ts` (validation, error messages, router-state helpers), and `src/core/api/AuthApi.ts` (endpoints).

## Flows

```
/login ──has-users=false──▶ /register ──201──▶ /verify-otp (email in state) ──200──▶ /login ("verified" notice)
/login ──"Forgot your password?"──▶ /forgot-password ──(email link)──▶ /reset-password?token=… ──200──▶ /login ("reset" notice)
```

| Page               | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`           | Queries `GET /auth/has-users`. `false` redirects to `/register` (AC-31). A failed check is ignored and the form stays. Shows `state.notice` in `role="status"`. Links to `/forgot-password` and `/register`.                                                                                                                                                                                                                                                                                                                                                                   |
| `/register`        | Heading "Set up admin account" when has-users is `false`, else "Create account". Client checks: name required; username 3–32 of `[a-zA-Z0-9_.-]`; a valid email; password ≥ 8. Errors sit under each field (`aria-invalid`, `aria-describedby`). Sends `accountType: true` (SPEC Assumption 3). 409 → "Email or username is already in use." Success → `/verify-otp` with `{ email }`.                                                                                                                                                                                         |
| `/verify-otp`      | Email (prefilled from state, editable) and a 6-digit code (`inputmode="numeric"`, `autocomplete="one-time-code"`). **Resend code** posts `/auth/resend-otp` and confirms in `role="status"`. 400 → invalid or expired code, 404 → no account, 409 → already verified plus a "Go to sign in" link, 429 → too many attempts. Success → `/login` with the "verified" notice.                                                                                                                                                                                                      |
| `/forgot-password` | Posts the email and then always shows "If that email exists, a reset link was sent." in `role="status"`, whatever the server answered, so it never reveals whether an account exists.                                                                                                                                                                                                                                                                                                                                                                                          |
| `/reset-password`  | Reads `?token` once into component state, then replaces the current history entry with `/reset-password` (no query, no new entry), so the token does not stay in the address bar, history or a `Referer` (SEC-5). A reload after that strip shows "Link expired": the user opens the email link again (accepted trade-off). No token, or a 400 from the server, shows "Link expired" with a "Request a new link" link to `/forgot-password`. New password (≥ 8) plus a matching confirmation. Other errors show in `role="alert"`. Success → `/login` with the "reset" notice. |

## Contract

All under `/api/v1`, all public and rate-limited (429), and all sent with `skipAuthRefresh` so a 401 never triggers a token refresh.

| Endpoint (`authApi` hook)                                  | Body                                               | Success           | Errors handled         |
| ---------------------------------------------------------- | -------------------------------------------------- | ----------------- | ---------------------- |
| `GET /auth/has-users` (`useHasUsersQuery`)                 | —                                                  | `{ hasUsers }`    | ignored                |
| `POST /auth/register` (`useRegisterMutation`)              | `{ email, name, username, password, accountType }` | 201 `{ message }` | 409, 429               |
| `POST /auth/verify-otp` (`useVerifyOtpMutation`)           | `{ email, otp }`                                   | 200 `{ message }` | 400, 404, 409, 429     |
| `POST /auth/resend-otp` (`useResendOtpMutation`)           | `{ email }`                                        | 200 `{ message }` | 404, 409, 429          |
| `POST /auth/forgot-password` (`useForgotPasswordMutation`) | `{ email }`                                        | 200 `{ message }` | none shown (see above) |
| `POST /auth/reset-password` (`useResetPasswordMutation`)   | `{ token, newPassword }`                           | 200 `{ message }` | 400 → "Link expired"   |

Any other error shows the server's message (`ApiError.message`). No new env vars: the pages use `API_BASE_URL` like everything else ([Testing and config](./testing-and-config.md)).

`onboarding.ts` exports the pure pieces: `validateRegister`, `validateEmail`, `validateOtp`, `validateNewPassword`, `registerErrorMessage`, `verifyOtpErrorMessage`, `resendOtpErrorMessage`, `emailFromState`, and `loginNoticeState(notice)` / `loginNoticeMessage(state)` for the `/login` notices (`'verified' | 'passwordReset'`).

## Decisions

- **`has-users` is not cached once unused** (`keepUnusedDataFor: 0`). Otherwise the "no users" answer from the first visit would still be cached when the new admin lands back on `/login` after verifying, and they would bounce back to `/register`. `LoginPage.test.tsx` has a regression test.
- **Forgot-password errors.** Any HTTP answer (including 404, 429 and 5xx) shows the generic message. Only a request that never reached the server (status 0) shows the connection error, because then nothing was sent and the generic text would be false.
- **Verify-OTP email is editable.** Someone who opens `/verify-otp` directly (no router state) can still type the email.
- **Login links** to `/forgot-password` and `/register` were added so the flows are reachable without typing URLs.

## How to test

- Unit: `src/features/auth/onboarding.test.ts`, `src/core/api/AuthApi.test.ts`, and the page tests next to each page (MSW for success and every error mapping). `src/test/msw/handlers.ts` answers `has-users` with `true` by default; override it with `server.use` for the first-run case.

### E2E

`e2e/onboarding.spec.ts` covers a first run (register → resend → wrong code → verify → sign in as the admin), a 409 on register, forgot → reset → the old password fails and the new one works, the generic forgot-password answer for an unknown email, "Link expired" for a missing or unknown token, the token strip (URL without a query, `history.length` unchanged, the reset still succeeds) and "Link expired" on a reload after the strip.

The `mockApi` fixture models these endpoints:

| Modelled                     | Behaviour                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`        | 409 when the email or username is taken, else an unverified user (the first one gets `ROLES.superAdmin`) and 201 |
| `POST /auth/verify-otp`      | 404 unknown email, 409 already verified, 400 unless the code is `OTP_CODE` (`123456`), else verifies the user    |
| `POST /auth/resend-otp`      | 404 unknown email, 409 already verified, else 200                                                                |
| `POST /auth/forgot-password` | Always 200. For a known email it stores a reset token: read it with `mockApi.resetTokenFor(email)`               |
| `POST /auth/reset-password`  | 400 for an unknown or used token, else sets the new password and consumes the token                              |

Run: `pnpm --filter cms-admin test:cov` and `pnpm --filter cms-admin test:e2e`.
