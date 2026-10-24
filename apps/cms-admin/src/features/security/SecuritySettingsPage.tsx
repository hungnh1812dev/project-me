import { COPY } from '../../config/copy.constants';
import { ChangePasswordSection } from './ChangePasswordSection';
import { TwoFactorSection } from './TwoFactorSection';

/** `/settings/security`: two-factor and password of the signed-in account. */
export function SecuritySettingsPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {COPY.security.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {COPY.security.description}
        </p>
      </div>
      <TwoFactorSection />
      <ChangePasswordSection />
    </div>
  );
}
