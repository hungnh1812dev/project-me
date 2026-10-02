import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import AuthLayout from '@/layouts/AuthLayout';

function reasonFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('reason' in state)) return null;
  return typeof state.reason === 'string' ? state.reason : null;
}

/** `/403`: the user is signed in but not allowed to open the page they asked for (AC-44). */
const ForbiddenPage: React.FC = () => {
  const reason = reasonFrom(useLocation().state);

  return (
    <AuthLayout
      title="Access denied"
      description="You don't have permission to view this page."
      footer={
        <Button variant="link" className="px-0" render={<Link to="/admin" />}>
          Back to admin home
        </Button>
      }
    >
      {reason !== null && <p className="text-sm text-muted-foreground">{reason}</p>}
    </AuthLayout>
  );
};
ForbiddenPage.displayName = 'ForbiddenPage';

export default ForbiddenPage;
