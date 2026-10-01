import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useResendOtpMutation, useVerifyOtpMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import {
  emailFromState,
  loginNoticeState,
  resendOtpErrorMessage,
  validateEmail,
  validateOtp,
  verifyOtpErrorMessage,
} from '@/features/auth/onboarding';

interface PageError {
  message: string;
  /** 409: the email is already verified, so offer the way to sign in. */
  alreadyVerified?: boolean;
}

/**
 * `/verify-otp`. Takes the email (prefilled from `/register`) and the 6-digit code, can resend the
 * code, and on success goes to `/login` with a "verified" notice.
 */
const VerifyOtpPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [verifyOtp, { isLoading: verifying }] = useVerifyOtpMutation();
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();
  const [email, setEmail] = useState(() => emailFromState(location.state));
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<PageError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSentTo(null);
    const invalid = validateEmail(email) ?? validateOtp(otp);
    if (invalid) {
      setError({ message: invalid });
      return;
    }
    setError(null);
    try {
      await verifyOtp({ email, otp }).unwrap();
      navigate('/login', { replace: true, state: loginNoticeState('verified') });
    } catch (thrown) {
      const apiError = toApiErrorData(thrown);
      setError({
        message: verifyOtpErrorMessage(apiError),
        alreadyVerified: apiError.status === 409,
      });
    }
  };

  const handleResend = async () => {
    setSentTo(null);
    const invalid = validateEmail(email);
    if (invalid) {
      setError({ message: invalid });
      return;
    }
    setError(null);
    try {
      await resendOtp({ email }).unwrap();
      setSentTo(email);
    } catch (thrown) {
      const apiError = toApiErrorData(thrown);
      setError({
        message: resendOtpErrorMessage(apiError),
        alreadyVerified: apiError.status === 409,
      });
    }
  };

  return (
    <main>
      <h1>Verify your email</h1>
      <p>Enter the 6-digit code we sent to your email.</p>
      <form noValidate onSubmit={(event) => void handleVerify(event)}>
        <p>
          <label htmlFor="verify-email">Email</label>
          <input
            id="verify-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="verify-otp">Verification code</label>
          <input
            id="verify-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value.trim())}
          />
        </p>
        {error && (
          <p role="alert">
            {error.message}
            {error.alreadyVerified && (
              <>
                {' '}
                <Link to="/login">Go to sign in</Link>
              </>
            )}
          </p>
        )}
        {sentTo && <p role="status">A new code was sent to {sentTo}.</p>}
        <button type="submit" disabled={verifying}>
          {verifying ? 'Verifying…' : 'Verify'}
        </button>{' '}
        <button type="button" disabled={resending} onClick={() => void handleResend()}>
          Resend code
        </button>
      </form>
    </main>
  );
};
VerifyOtpPage.displayName = 'VerifyOtpPage';

export default VerifyOtpPage;
