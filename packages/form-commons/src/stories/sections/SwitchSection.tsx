import { Field } from '../../components/forms/Field';
import { Switch } from '../../components/ui/switch';
import { Section } from './Section';

/** The UI kit's Switch section: off, on, disabled, error, required (AC-9). */
export const SwitchSection: React.FC = () => (
  <Section title="Switch">
    <Field label="Notifications">
      <Switch name="notifications" value="on" />
    </Field>
    <Field label="Published">
      <Switch defaultChecked />
    </Field>
    <Field label="Disabled switch">
      <Switch disabled />
    </Field>
    <Field label="Accept terms" error="You must accept the terms.">
      <Switch />
    </Field>
    <Field label="Visible" required>
      <Switch />
    </Field>
  </Section>
);
SwitchSection.displayName = 'SwitchSection';
