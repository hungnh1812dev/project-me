import { useEffect, useRef, useState } from 'react';
import { LogOutIcon, PencilIcon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/cn';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCurrentUserQuery } from '@/features/auth/hooks/useCurrentUserQuery';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';

import { EditNameForm } from './EditNameForm';

const DL = 'grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-2 text-sm';
const DT = 'text-muted-foreground';
const DD = 'min-w-0 break-words text-foreground';

/**
 * `/admin/profile`: who is signed in, their role and permissions, and Log out (AC-38). The name is
 * editable inline (AC-39 to AC-41); leaving the form returns focus to Edit name.
 */
const ProfilePage: React.FC = () => {
  const { user: sessionUser, logout } = useAuth();
  const { data: freshUser, isError } = useCurrentUserQuery();
  const { message, announce } = useAnnouncer();
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    editButtonRef.current?.focus();
  }, [editing]);

  const user = freshUser ?? sessionUser;
  if (!user) return null;

  const closeForm = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  const { role } = user;
  const permissions = role?.permissions ?? [];

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      {isError && <Alert variant="destructive">Couldn&apos;t refresh your profile.</Alert>}
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className={DL}>
            <dt className={DT}>Name</dt>
            <dd className={DD}>
              {editing ? (
                <EditNameForm
                  name={user.name}
                  onCancel={closeForm}
                  onSaved={() => {
                    closeForm();
                    announce('Name updated.');
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words">{user.name}</span>
                  <Button
                    ref={editButtonRef}
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                  >
                    <PencilIcon aria-hidden="true" />
                    Edit name
                  </Button>
                </div>
              )}
            </dd>
            <dt className={DT}>Username</dt>
            <dd className={DD}>{user.username}</dd>
            <dt className={DT}>Email</dt>
            <dd className={DD}>{user.email}</dd>
            <dt className={DT}>Email status</dt>
            <dd className={DD}>
              <Badge variant={user.verified ? 'secondary' : 'destructive'}>
                {user.verified ? 'Verified' : 'Not verified'}
              </Badge>
            </dd>
          </dl>

          <Separator />

          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Role</h2>
            {role ? (
              <dl className={DL}>
                <dt className={DT}>Name</dt>
                <dd className={DD}>{role.name}</dd>
                <dt className={DT}>Slug</dt>
                <dd className={cn(DD, 'font-mono')}>{role.slug}</dd>
                <dt className={DT}>Level</dt>
                <dd className={DD}>{role.level}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No role assigned</p>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <h2 id="profile-permissions" className="text-base font-semibold">
              Permissions
            </h2>
            {permissions.length > 0 ? (
              <ul aria-labelledby="profile-permissions" className="flex flex-wrap gap-2 font-mono">
                {permissions.map((slug) => (
                  <li
                    key={slug}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    {slug}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No permissions</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="outline" onClick={() => void logout()}>
            <LogOutIcon aria-hidden="true" />
            Log out
          </Button>
        </CardFooter>
      </Card>
      <LiveRegion message={message} />
    </section>
  );
};
ProfilePage.displayName = 'ProfilePage';

export default ProfilePage;
