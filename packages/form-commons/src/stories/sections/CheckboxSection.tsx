import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Section } from './Section';

/** The UI kit's Checkbox section: unchecked, checked, mixed, disabled (AC-9). */
export const CheckboxSection: React.FC = () => (
  <Section title="Checkbox">
    {(
      [
        { id: 'ui-kit-subscribe', label: 'Subscribe' },
        { id: 'ui-kit-checked', label: 'Checked', defaultChecked: true },
        { id: 'ui-kit-mixed', label: 'Some selected', indeterminate: true },
        { id: 'ui-kit-checkbox-disabled', label: 'Disabled checkbox', disabled: true },
      ] as const
    ).map(({ id, label, ...props }) => (
      <div key={id} className="flex items-center gap-2">
        <Checkbox id={id} {...props} />
        <Label htmlFor={id}>{label}</Label>
      </div>
    ))}
  </Section>
);
CheckboxSection.displayName = 'CheckboxSection';
