import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Alert } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';

import { Field } from '@/components/form/Field';
import { PasswordInput } from '@/components/form/PasswordInput';
import { useHasUsersQuery, useRegisterMutation } from '@/core/api/AuthApi';
import { toApiErrorData } from '@/core/api/axiosBaseQuery';
import {
  registerErrorMessage,
  validateRegister,
  type RegisterErrors,
  type RegisterForm,
} from '@/features/auth/onboarding';
import AuthLayout from '@/layouts/AuthLayout';

const FIELDS: {
  name: keyof RegisterForm;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
}[] = [
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
    <AuthLayout
      title={firstRun ? 'Set up admin account' : 'Create account'}
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
        {FIELDS.map(({ name, label, type, autoComplete }) => {
          const controlProps = {
            id: `register-${name}`,
            autoComplete,
            value: form[name],
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              setForm({ ...form, [name]: event.target.value }),
          };
          return (
            <Field key={name} label={label} required error={fieldErrors[name]}>
              {type === 'password' ? (
                <PasswordInput {...controlProps} />
              ) : (
                <Input {...controlProps} type={type} />
              )}
            </Field>
          );
        })}
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" className="w-full" loading={isLoading}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
};
RegisterPage.displayName = 'RegisterPage';

export default RegisterPage;
