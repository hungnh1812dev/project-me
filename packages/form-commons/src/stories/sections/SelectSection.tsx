import { Field } from '../../components/forms/Field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Section } from './Section';

const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1y', label: '1 year' },
];

/** A Select whose trigger sits in a Field, as forms wire it. */
const SelectDemo: React.FC = () => (
  <Select items={EXPIRY_OPTIONS} defaultValue="1d">
    <Field label="Expires in">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
    </Field>
    <SelectContent>
      {EXPIRY_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
SelectDemo.displayName = 'SelectDemo';

/** The UI kit's Select section: "Expires in" and "Disabled select" (AC-9). */
export const SelectSection: React.FC = () => (
  <Section title="Select">
    <SelectDemo />
    <Select disabled defaultValue="1h" items={EXPIRY_OPTIONS}>
      <Field label="Disabled select">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </Field>
    </Select>
  </Section>
);
SelectSection.displayName = 'SelectSection';
