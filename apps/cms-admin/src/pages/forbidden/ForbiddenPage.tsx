import { Link, useLocation } from 'react-router-dom';

function reasonFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('reason' in state)) return null;
  return typeof state.reason === 'string' ? state.reason : null;
}

/** `/403`: the user is signed in but not allowed to open the page they asked for. */
const ForbiddenPage: React.FC = () => {
  const reason = reasonFrom(useLocation().state);

  return (
    <main>
      <h1>Access denied</h1>
      <p>You don&apos;t have permission to view this page.</p>
      {reason && <p>{reason}</p>}
      <p>
        <Link to="/admin">Back to admin home</Link>
      </p>
    </main>
  );
};
ForbiddenPage.displayName = 'ForbiddenPage';

export default ForbiddenPage;
