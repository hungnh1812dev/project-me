import { SearchIcon } from 'lucide-react';

import { Field } from '../../components/forms/Field';
import { PasswordInput } from '../../components/forms/PasswordInput';
import { Input } from '../../components/ui/input';
import { Section } from './Section';

/** The UI kit's Input section: placeholder, filled, disabled, error, required, search, password (AC-9). */
export const InputSection: React.FC = () => (
  <Section title="Input">
    <Field label="Name" description="Shown on your profile.">
      <Input placeholder="Jane Doe" />
    </Field>
    <Field label="Username">
      <Input defaultValue="jane" />
    </Field>
    <Field label="Disabled input">
      <Input disabled defaultValue="Read only" />
    </Field>
    <Field label="Email" error="Enter a valid email address.">
      <Input type="email" defaultValue="jane@" />
    </Field>
    <Field label="Title" required>
      <Input />
    </Field>
    <Field label="Search">
      <Input type="search" leading={<SearchIcon aria-hidden="true" />} />
    </Field>
    <Field label="Password">
      <PasswordInput autoComplete="new-password" />
    </Field>
  </Section>
);
InputSection.displayName = 'InputSection';
