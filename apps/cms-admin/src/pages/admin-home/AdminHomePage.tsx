import { UserIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** `/admin`: a welcome card with a link to the profile (AC-38). */
const AdminHomePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h1>
          <CardDescription>Manage your content and settings from the side menu.</CardDescription>
        </CardHeader>
        <CardContent>
          <nav aria-label="Admin">
            <ul>
              <li>
                <Button variant="outline" render={<Link to="/admin/profile" />}>
                  <UserIcon aria-hidden="true" />
                  Your profile
                </Button>
              </li>
            </ul>
          </nav>
        </CardContent>
      </Card>
    </section>
  );
};
AdminHomePage.displayName = 'AdminHomePage';

export default AdminHomePage;
