import { Button } from '@abyss/form-commons';
import { APP_ROUTES } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import { Link } from 'react-router';

/** Tertiary way out of the password pages. */
export function BackToSignIn() {
  return (
    <p className="mt-4">
      <Button asChild variant="link" className="h-auto px-0">
        <Link to={APP_ROUTES.LOGIN}>{COPY.password.backToSignIn}</Link>
      </Button>
    </p>
  );
}
