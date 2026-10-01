import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Field } from '@/components/form/Field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForgotPasswordMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import { validateEmail } from '@/features/auth/onboarding';
import AuthLayout from '@/layouts/AuthLayout';

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
    <AuthLayout
      title="Reset your password"
      footer={
        <Button variant="link" className="px-0" render={<Link to="/login" />}>
          Back to sign in
        </Button>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <Field label="Email" required>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        {error && <Alert variant="destructive">{error}</Alert>}
        {sent && <Alert role="status">{GENERIC_MESSAGE}</Alert>}
        <Button type="submit" className="w-full" loading={isLoading}>
          {isLoading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
};
ForgotPasswordPage.displayName = 'ForgotPasswordPage';

export default ForgotPasswordPage;
