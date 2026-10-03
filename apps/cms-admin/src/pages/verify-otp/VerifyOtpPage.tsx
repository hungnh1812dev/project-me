import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Alert } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';

import { Field } from '@/components/form/Field';
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
import AuthLayout from '@/layouts/AuthLayout';

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
    <AuthLayout
      title="Verify your email"
      description="Enter the 6-digit code we sent to your email."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleVerify(event)}
      >
        <Field label="Email" required>
          <Input
            id="verify-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Verification code" required>
          <Input
            id="verify-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="font-mono tracking-[0.3em]"
            value={otp}
            onChange={(event) => setOtp(event.target.value.trim())}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <p>
              {error.message}
              {error.alreadyVerified && (
                <>
                  {' '}
                  <Link to="/login" className="underline underline-offset-4">
                    Go to sign in
                  </Link>
                </>
              )}
            </p>
          </Alert>
        )}
        {sentTo && <Alert role="status">A new code was sent to {sentTo}.</Alert>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="sm:flex-1" loading={verifying}>
            {verifying ? 'Verifying…' : 'Verify'}
          </Button>
          <Button
            variant="outline"
            className="sm:flex-1"
            loading={resending}
            onClick={() => void handleResend()}
          >
            Resend code
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
};
VerifyOtpPage.displayName = 'VerifyOtpPage';

export default VerifyOtpPage;
