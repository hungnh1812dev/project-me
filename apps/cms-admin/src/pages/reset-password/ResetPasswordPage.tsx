import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useResetPasswordMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import { loginNoticeState, validateNewPassword } from '@/features/auth/onboarding';

/**
 * `/reset-password?token=…`, the link from the reset email. A missing token or a 400 (invalid or
 * expired token) shows "Link expired" with a way to request a new one. Success goes to `/login`.
 */
const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [resetPassword, { isLoading }] = useResetPasswordMutation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const token = searchParams.get('token') ?? '';

  if (token === '' || expired) {
    return (
      <main>
        <h1>Link expired</h1>
        <p>This password reset link is invalid or has expired.</p>
        <p>
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </main>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validateNewPassword(password, confirmation);
    setError(invalid);
    if (invalid) return;

    try {
      await resetPassword({ token, newPassword: password }).unwrap();
      navigate('/login', { replace: true, state: loginNoticeState('passwordReset') });
    } catch (thrown) {
      const apiError = toApiErrorData(thrown);
      if (apiError.status === 400) setExpired(true);
      else setError(apiError.message);
    }
  };

  return (
    <main>
      <h1>Choose a new password</h1>
      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <p>
          <label htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="reset-confirmation">Confirm new password</label>
          <input
            id="reset-confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </main>
  );
};
ResetPasswordPage.displayName = 'ResetPasswordPage';

export default ResetPasswordPage;
