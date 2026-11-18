import { Card } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { useCurrentUser } from '@features/auth';

/** `/settings/profile`: read-only details of the signed-in account. */
export function ProfilePage() {
  const copy = useScreenText('security').security.profile;
  const user = useCurrentUser();
  if (user === null) return null;

  const rows = [
    { label: copy.name, value: user.displayName },
    { label: copy.email, value: user.email },
    { label: copy.role, value: user.role },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <Card asChild className="grid max-w-md gap-4">
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
