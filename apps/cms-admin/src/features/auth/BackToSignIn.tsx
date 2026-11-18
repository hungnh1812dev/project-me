import { Button } from '@abyss/form-commons';
import { APP_ROUTES } from '@configs/App.routes';
import { COMMON_TEXT } from '@configs/locales';
import { Link } from 'react-router';

/** Tertiary way out of the password pages. */
export function BackToSignIn() {
  return (
    <p className="mt-4">
      <Button asChild variant="link" className="h-auto px-0">
        <Link to={APP_ROUTES.LOGIN}>{COMMON_TEXT.password.backToSignIn}</Link>
      </Button>
    </p>
  );
}
