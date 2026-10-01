import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCurrentUserQuery } from '@/features/auth/hooks/useCurrentUserQuery';

/** `/admin/profile`: who is signed in, their role and permissions, and Log out. */
const ProfilePage: React.FC = () => {
  const { user: sessionUser, logout } = useAuth();
  const { data: freshUser, isError } = useCurrentUserQuery();
  const user = freshUser ?? sessionUser;
  if (!user) return null;

  const { role } = user;
  const permissions = role?.permissions ?? [];

  return (
    <section>
      <h1>Your profile</h1>
      {isError && <p role="alert">Couldn&apos;t refresh your profile.</p>}

      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Username</dt>
        <dd>{user.username}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Email status</dt>
        <dd>{user.verified ? 'Verified' : 'Not verified'}</dd>
      </dl>

      <h2>Role</h2>
      {role ? (
        <dl>
          <dt>Name</dt>
          <dd>{role.name}</dd>
          <dt>Slug</dt>
          <dd>{role.slug}</dd>
          <dt>Level</dt>
          <dd>{role.level}</dd>
        </dl>
      ) : (
        <p>No role assigned</p>
      )}

      <h2 id="profile-permissions">Permissions</h2>
      {permissions.length > 0 ? (
        <ul aria-labelledby="profile-permissions">
          {permissions.map((slug) => (
            <li key={slug}>{slug}</li>
          ))}
        </ul>
      ) : (
        <p>No permissions</p>
      )}

      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </section>
  );
};
ProfilePage.displayName = 'ProfilePage';

export default ProfilePage;
