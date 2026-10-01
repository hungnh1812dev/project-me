import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface SettingsPlaceholderPageProps {
  /** The page label from `SETTINGS_LINKS`, e.g. "Users". */
  label: string;
}

/** `/admin/settings/*` (AC-26): a placeholder until the settings screens arrive in Phase 4. */
const SettingsPlaceholderPage: React.FC<SettingsPlaceholderPageProps> = ({ label }) => (
  <section>
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-card-foreground">{label}</h1>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming in Phase 4.</p>
      </CardContent>
    </Card>
  </section>
);
SettingsPlaceholderPage.displayName = 'SettingsPlaceholderPage';

export default SettingsPlaceholderPage;
