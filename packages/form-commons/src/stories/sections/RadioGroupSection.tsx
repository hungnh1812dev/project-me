import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Section } from './Section';

/** The UI kit's RadioGroup section: "Density" with three options (AC-9). */
export const RadioGroupSection: React.FC = () => (
  <Section title="RadioGroup">
    <RadioGroup aria-label="Density" defaultValue="comfortable">
      {(
        [
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
          { value: 'spacious', label: 'Spacious' },
        ] as const
      ).map(({ value, label }) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem id={`ui-kit-density-${value}`} value={value} />
          <Label htmlFor={`ui-kit-density-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  </Section>
);
RadioGroupSection.displayName = 'RadioGroupSection';
