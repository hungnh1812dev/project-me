import { useState } from 'react';
import { SearchIcon } from 'lucide-react';

import { Field } from '../../components/forms/Field';
import { PasswordInput } from '../../components/forms/PasswordInput';
import { Input } from '../../components/ui/input';
import { Section } from './Section';

/**
 * The UI kit's Input section: placeholder, filled, disabled, error, required, search, password
 * (AC-9), on local state.
 */
export const InputSection: React.FC = () => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('jane');
  const [email, setEmail] = useState('jane@');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Section title="Input">
      <Field label="Name" description="Shown on your profile.">
        <Input value={name} onChange={setName} config={{ placeholder: 'Jane Doe' }} />
      </Field>
      <Field label="Username">
        <Input value={username} onChange={setUsername} />
      </Field>
      <Field label="Disabled input">
        <Input value="Read only" onChange={() => {}} disabled />
      </Field>
      <Field label="Email" error="Enter a valid email address.">
        <Input value={email} onChange={setEmail} config={{ type: 'email' }} />
      </Field>
      <Field label="Title" required>
        <Input value={title} onChange={setTitle} />
      </Field>
      <Field label="Search">
        <Input
          value={search}
          onChange={setSearch}
          config={{ type: 'search' }}
          leading={<SearchIcon aria-hidden="true" />}
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          onChange={setPassword}
          config={{ autoComplete: 'new-password' }}
        />
      </Field>
    </Section>
  );
};
InputSection.displayName = 'InputSection';
