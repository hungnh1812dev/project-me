import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useHasUsersQuery, useRegisterMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import {
  registerErrorMessage,
  validateRegister,
  type RegisterErrors,
  type RegisterForm,
} from '@/features/auth/onboarding';

const FIELDS: { name: keyof RegisterForm; label: string; type: string; autoComplete: string }[] = [
  { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
];

const EMPTY: RegisterForm = { name: '', username: '', email: '', password: '' };

/**
 * `/register`. Creates an account (`accountType: true`), then goes to `/verify-otp` with the email
 * in router state. On a CMS with no users yet it is the first-run admin setup.
 */
const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: hasUsers } = useHasUsersQuery();
  const [register, { isLoading }] = useRegisterMutation();
  const [form, setForm] = useState<RegisterForm>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<RegisterErrors>({});
  const [error, setError] = useState<string | null>(null);

  const firstRun = hasUsers?.hasUsers === false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateRegister(form);
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    try {
      await register({ ...form, accountType: true }).unwrap();
      navigate('/verify-otp', { state: { email: form.email } });
    } catch (thrown) {
      setError(registerErrorMessage(toApiErrorData(thrown)));
    }
  };

  return (
    <main>
      <h1>{firstRun ? 'Set up admin account' : 'Create account'}</h1>
      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        {FIELDS.map(({ name, label, type, autoComplete }) => {
          const id = `register-${name}`;
          const fieldError = fieldErrors[name];
          return (
            <p key={name}>
              <label htmlFor={id}>{label}</label>
              <input
                id={id}
                type={type}
                autoComplete={autoComplete}
                required
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${id}-error` : undefined}
                value={form[name]}
                onChange={(event) => setForm({ ...form, [name]: event.target.value })}
              />
              {fieldError && <span id={`${id}-error`}>{fieldError}</span>}
            </p>
          );
        })}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </main>
  );
};
RegisterPage.displayName = 'RegisterPage';

export default RegisterPage;
