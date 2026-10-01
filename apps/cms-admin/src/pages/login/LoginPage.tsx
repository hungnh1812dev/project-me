import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { redirectTarget } from '@/features/auth/redirect';

/**
 * `/login`. A signed-in user (already, or after submitting) goes to `state.from`, or `/admin`
 * when there is none.
 */
const LoginPage: React.FC = () => {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') {
    return <Navigate to={redirectTarget(location.state)} replace />;
  }

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
    <main>
      <h1>Sign in</h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <p>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </p>
        <p>
          <label>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />{' '}
            Remember me
          </label>
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending || checkingSession}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
};
LoginPage.displayName = 'LoginPage';

export default LoginPage;
