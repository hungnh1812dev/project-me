import { useScreenText } from '@configs/locales';

import { TwoFactorSection } from './TwoFactorSection';

/** `/settings/security`: two-factor of the signed-in account. */
export function SecuritySettingsPage() {
  const { security } = useScreenText('security');
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{security.title}</h1>
        <p className="text-sm text-muted-foreground">{security.description}</p>
      </div>
      <TwoFactorSection />
    </div>
  );
}
