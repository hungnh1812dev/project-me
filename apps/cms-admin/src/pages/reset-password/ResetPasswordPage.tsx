import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Alert } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Field } from '@repo/ui/form/Field';
import { PasswordInput } from '@repo/ui/form/PasswordInput';

import { useResetPasswordMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import { loginNoticeState, validateNewPassword } from '@/features/auth/onboarding';
import AuthLayout from '@/layouts/AuthLayout';

/**
 * `/reset-password?token=…`, the link from the reset email. A missing token or a 400 (invalid or
 * expired token) shows "Link expired" with a way to request a new one. Success goes to `/login`.
 *
 * SEC-5: the token is read once into state, then the query is stripped from the URL by replacing
 * the current history entry, so it does not linger in history, the address bar or a Referer. A
 * reload after the strip therefore shows "Link expired"; the user opens the email link again.
 */
const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [resetPassword, { isLoading }] = useResetPasswordMutation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const [token] = useState(() => searchParams.get('token') ?? '');

  const hasQuery = searchParams.size > 0;
  useEffect(() => {
    if (hasQuery) navigate({ search: '' }, { replace: true });
  }, [hasQuery, navigate]);

  if (token === '' || expired) {
    return (
      <AuthLayout
        title="Link expired"
        description="This password reset link is invalid or has expired."
      >
        <Button variant="outline" className="w-full" render={<Link to="/forgot-password" />}>
          Request a new link
        </Button>
      </AuthLayout>
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
    <AuthLayout title="Choose a new password">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <Field label="New password" required>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password" required>
          <PasswordInput
            id="reset-confirmation"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" className="w-full" loading={isLoading}>
          {isLoading ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </AuthLayout>
  );
};
ResetPasswordPage.displayName = 'ResetPasswordPage';

export default ResetPasswordPage;
