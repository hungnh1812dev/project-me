import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useForgotPasswordMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import { validateEmail } from '@/features/auth/onboarding';

const GENERIC_MESSAGE = 'If that email exists, a reset link was sent.';

/**
 * `/forgot-password`. Any answer from the server shows the same generic message, so the page never
 * reveals whether an account exists. Only a request that never reached the server shows an error.
 */
const ForgotPasswordPage: React.FC = () => {
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(false);
    const invalid = validateEmail(email);
    setError(invalid);
    if (invalid) return;

    try {
      await forgotPassword({ email }).unwrap();
      setSent(true);
    } catch (thrown) {
      const apiError = toApiErrorData(thrown);
      if (apiError.status === 0) setError(apiError.message);
      else setSent(true);
    }
  };

  return (
    <main>
      <h1>Reset your password</h1>
      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <p>
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </p>
        {error && <p role="alert">{error}</p>}
        {sent && <p role="status">{GENERIC_MESSAGE}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </main>
  );
};
ForgotPasswordPage.displayName = 'ForgotPasswordPage';

export default ForgotPasswordPage;
