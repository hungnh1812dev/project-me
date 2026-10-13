import { Field } from '../../components/forms/Field';
import { Textarea } from '../../components/ui/textarea';
import { Section } from './Section';

/** The UI kit's Textarea section: empty, counter (Bio), disabled, error, required (AC-9). */
export const TextareaSection: React.FC = () => (
  <Section title="Textarea">
    <Field label="Notes">
      <Textarea />
    </Field>
    <Field label="Bio" description="Up to 120 characters.">
      <Textarea maxLength={120} defaultValue="Editor at the CMS." />
    </Field>
    <Field label="Disabled textarea">
      <Textarea disabled defaultValue="Read only" />
    </Field>
    <Field label="Summary" error="The summary is too short.">
      <Textarea defaultValue="Hi" />
    </Field>
    <Field label="Body" required>
      <Textarea />
    </Field>
  </Section>
);
TextareaSection.displayName = 'TextareaSection';
