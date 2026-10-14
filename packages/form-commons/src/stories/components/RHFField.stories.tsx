import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { expect, waitFor } from 'storybook/test';
import { z } from 'zod';

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
        className="bg-muted rounded-md p-3 font-mono text-sm whitespace-pre-wrap"
      >
        {submitted ? JSON.stringify(submitted, null, 2) : 'Nothing submitted yet.'}
      </pre>
    </div>
  );
};
SettingsForm.displayName = 'SettingsForm';

/** Where the Playground's rule lives: native `rules`, a per-field `schema`, or the form's `resolver`. */
type Validation = 'rules' | 'schema' | 'resolver';

interface PlaygroundFieldProps {
  label: string;
  description?: string;
  /** The message for an empty title; empty makes the field optional. */
  requiredMessage: string;
  /** The same rule three ways: `rules={{ required }}`, `schema={z.string().min(1)}`, or `zodResolver`. */
  validation: Validation;
  hideLabel?: boolean;
}

type PlaygroundValues = { title: string };

/** The title rule as a zod schema: non-empty when a message is set, else anything. */
const titleSchema = (requiredMessage: string) =>
  requiredMessage ? z.string().min(1, requiredMessage) : z.string();

/** The Playground's value, as the other Playgrounds show it. */
const TitleReadout: React.FC = () => {
  const value = useWatch<{ title: string }, 'title'>({ name: 'title' });
  return (
    <p className="text-muted-foreground text-sm">
      Value:{' '}
      <output aria-label="Value" className="text-foreground font-mono">
        {JSON.stringify(value)}
      </output>
    </p>
  );
};
TitleReadout.displayName = 'TitleReadout';

/** One RHFField around an Input, in its own form; Submit runs the rules. */
const PlaygroundForm: React.FC<PlaygroundFieldProps> = ({
  label,
  description,
  requiredMessage,
  validation,
  hideLabel,
}) => {
  const form = useForm<PlaygroundValues>({
    defaultValues: { title: '' },
    resolver:
      validation === 'resolver'
        ? zodResolver(z.object({ title: titleSchema(requiredMessage) }))
        : undefined,
  });
  return (
    <FormProvider {...form}>
      <form
        aria-label="Playground"
        noValidate
        className="flex max-w-md flex-col gap-4"
        onSubmit={form.handleSubmit(() => {})}
      >
        <RHFField<PlaygroundValues, 'title'>
          name="title"
          label={label}
          description={description || undefined}
          hideLabel={hideLabel}
          required={Boolean(requiredMessage)}
          rules={
            validation === 'rules' && requiredMessage ? { required: requiredMessage } : undefined
          }
          schema={validation === 'schema' ? titleSchema(requiredMessage) : undefined}
        >
          {(field) => <Input {...field} />}
        </RHFField>
        <Button type="submit" className="self-start">
          Submit
        </Button>
        <TitleReadout />
      </form>
    </FormProvider>
  );
};
PlaygroundForm.displayName = 'PlaygroundForm';

/** Remounts the form when `validation` changes, so a new resolver takes effect. */
const PlaygroundField: React.FC<PlaygroundFieldProps> = (props) => (
  <PlaygroundForm key={props.validation} {...props} />
);
PlaygroundField.displayName = 'PlaygroundField';

const meta = {
  title: 'Components/RHFField',
  component: PlaygroundField,
  args: {
    label: 'Title',
    description: 'Shown on the card.',
    requiredMessage: 'Enter a title.',
    validation: 'rules',
    hideLabel: false,
  },
  argTypes: {
    validation: { control: 'inline-radio', options: ['rules', 'schema', 'resolver'] },
  },
} satisfies Meta<typeof PlaygroundField>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A whole react-hook-form form: Input, Switch, Select and JsonInput through `RHFField`. Empty
 * submit shows every field's error; a valid submit shows the values as JSON (AC-16).
 */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
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

/**
 * One RHFField around an Input: `label`, `description`, the required message, `validation` (native
 * `rules`, a zod `schema` on the field, or a form-level `zodResolver`) and `hideLabel` are
 * Controls. Submit runs the rule; the error shows under the field and clears as you type.
 */
export const Playground: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Enter a title.');

    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), 'Launch');
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"Launch"'),
    );
    await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument());
  },
};
