import { useState } from 'react';

import { Field } from '../../components/native/Field';
import { Textarea } from '../../components/ui/textarea';
import { Section } from './Section';

/** The UI kit's Textarea section: empty, counter (Bio), disabled, error, required (AC-9), on local state. */
export const TextareaSection: React.FC = () => {
  const [notes, setNotes] = useState('');
  const [bio, setBio] = useState('Editor at the CMS.');
  const [summary, setSummary] = useState('Hi');
  const [body, setBody] = useState('');

  return (
    <Section title="Textarea">
      <Field label="Notes">
        <Textarea value={notes} onChange={setNotes} />
      </Field>
      <Field label="Bio" description="Up to 120 characters.">
        <Textarea value={bio} onChange={setBio} config={{ maxLength: 120 }} />
      </Field>
      <Field label="Disabled textarea">
        <Textarea value="Read only" onChange={() => {}} disabled />
      </Field>
      <Field label="Summary" error="The summary is too short.">
        <Textarea value={summary} onChange={setSummary} />
      </Field>
      <Field label="Body" required>
        <Textarea value={body} onChange={setBody} />
      </Field>
    </Section>
  );
};
TextareaSection.displayName = 'TextareaSection';
