import { Link } from 'react-router-dom';

import { useAuth } from '@/features/auth/hooks/useAuth';

/** `/admin`: placeholder home until the Phase 3 layout. */
const AdminHomePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <main>
      <h1>Welcome, {user?.name}</h1>
      <nav aria-label="Admin">
        <ul>
          <li>
            <Link to="/admin/profile">Your profile</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
};
AdminHomePage.displayName = 'AdminHomePage';

export default AdminHomePage;
