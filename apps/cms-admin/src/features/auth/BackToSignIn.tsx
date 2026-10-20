import { Button } from '@abyss/form-commons';
import { Link } from 'react-router';

import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';

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
