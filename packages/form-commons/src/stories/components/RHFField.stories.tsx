import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormProvider, useForm } from 'react-hook-form';
import { expect } from 'storybook/test';

import { JsonInput } from '../../components/forms/JsonInput';
import { RHFField } from '../../components/rhf/RHFField';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import type { InputOption } from '../../lib/inputContract';
import { parseJson } from '../../lib/json';

type Settings = {
  title: string;
  notifications: boolean;
  expires: string | null;
  metadata: string;
};

const DEFAULTS: Settings = { title: '', notifications: false, expires: null, metadata: '' };

const EXPIRES: InputOption[] = [
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1y', label: '1 year' },
];

/** The JSON text must parse to an object; the parse message becomes the field error (D-6). */
const validateMetadata = (text: string): true | string => {
  const result = parseJson(text, { required: true, expect: 'object' });
  return result.ok || result.message;
};

/**
 * A react-hook-form form built from `RHFField` (AC-16): a required text field, a Switch, a
 * required Select and a JSON field. Submitting shows the errors, or the submitted values as JSON.
 */
const SettingsForm: React.FC = () => {
  const form = useForm<Settings>({ defaultValues: DEFAULTS });
  const [submitted, setSubmitted] = useState<Settings | null>(null);

  return (
    <div className="flex max-w-md flex-col gap-6">
      <FormProvider {...form}>
        <form
          aria-label="Settings"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(setSubmitted)}
        >
          <RHFField<Settings, 'title'>
            name="title"
            label="Title"
            rules={{ required: 'Enter a title.' }}
          >
            {(field) => <Input {...field} />}
          </RHFField>
          <RHFField<Settings, 'notifications'>
            name="notifications"
            label="Notifications"
            description="Email me when the content changes."
          >
            {(field) => <Switch {...field} />}
          </RHFField>
          <RHFField<Settings, 'expires'>
            name="expires"
            label="Expires in"
            rules={{ required: 'Pick an expiry.' }}
          >
            {(field) => (
              <Select {...field} config={{ placeholder: 'Choose an expiry', options: EXPIRES }} />
            )}
          </RHFField>
          <RHFField<Settings, 'metadata'>
            name="metadata"
            label="Metadata"
            description="A JSON object."
            required
            rules={{ validate: validateMetadata }}
          >
            {(field) => (
              <JsonInput {...field} config={{ label: 'Metadata', expect: 'object', rows: 4 }} />
            )}
          </RHFField>
          <Button type="submit" className="self-start">
            Submit
          </Button>
        </form>
      </FormProvider>
      <pre
        role="status"
        aria-label="Submitted values"
        className="rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap"
      >
        {submitted ? JSON.stringify(submitted, null, 2) : 'Nothing submitted yet.'}
      </pre>
    </div>
  );
};
SettingsForm.displayName = 'SettingsForm';

const meta = {
  title: 'Components/RHFField',
  parameters: { controls: { disable: true }, actions: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty submit shows every field's error; a valid submit shows the values as JSON (AC-16). */
export const Form: Story = {
  render: () => <SettingsForm />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));

    const alerts = await canvas.findAllByRole('alert');
    await expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Enter a title.',
      'Pick an expiry.',
      'This field is required.',
    ]);
    await expect(canvas.getByRole('status', { name: 'Submitted values' })).toHaveTextContent(
      'Nothing submitted yet.',
    );
  },
};
