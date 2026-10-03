import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { Button } from '@repo/ui/components/button';

import { Field } from '@/components/form/Field';
import { PasswordInput } from '@/components/form/PasswordInput';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasUsersQuery } from '@/core/api/AuthApi';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { loginNoticeMessage } from '@/features/auth/onboarding';
import { redirectTarget } from '@/features/auth/redirect';
import AuthLayout from '@/layouts/AuthLayout';

/**
 * `/login`. A signed-in user (already, or after submitting) goes to `state.from`, or `/admin`
 * when there is none. A CMS with no users yet goes to `/register` (first-run setup).
 */
const LoginPage: React.FC = () => {
  const { status, login } = useAuth();
  const location = useLocation();
  const { data: hasUsers } = useHasUsersQuery();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state)} replace />;
  }
  if (hasUsers?.hasUsers === false) {
    return <Navigate to="/register" replace />;
  }

  const notice = loginNoticeMessage(location.state);

  // A bootstrap still in flight could clear the session that this login creates.
  const checkingSession = status === 'idle' || status === 'loading';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await login({ email, password, rememberMe });
    // On success the status change above redirects, and this page unmounts.
    if (!result.ok) {
      setError(result.message);
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      footer={
        <>
          <Button variant="link" className="px-0" render={<Link to="/forgot-password" />}>
            Forgot your password?
          </Button>
          <Button variant="link" className="px-0" render={<Link to="/register" />}>
            Create an account
          </Button>
        </>
      }
    >
      {notice && <Alert role="status">{notice}</Alert>}
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Field label="Email" required>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password" required>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id="login-remember"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked)}
          />
          <Label htmlFor="login-remember">Remember me</Label>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" className="w-full" loading={pending} disabled={checkingSession}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
};
LoginPage.displayName = 'LoginPage';

export default LoginPage;
