import { useScreenText } from '@configs/locales';

import { ChangePasswordSection } from './ChangePasswordSection';

/** `/settings/password`: change the password of the signed-in account. */
export function ChangePasswordPage() {
  const { security } = useScreenText('security');
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{security.changePassword.pageTitle}</h1>
      <ChangePasswordSection />
    </div>
  );
}
