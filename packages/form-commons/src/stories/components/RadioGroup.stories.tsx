import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Controlled, useArgsValue } from '../Controlled';
import { RadioGroupSection } from '../sections/RadioGroupSection';

const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  args: {
    'aria-label': 'Density',
    value: null,
    onChange: fn(),
    onBlur: fn(),
    config: {
      orientation: 'vertical',
      options: [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
        { value: 'spacious', label: 'Spacious' },
      ],
    },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'text' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    children: { control: false },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The "Density" group with Comfortable, Compact and Spacious (AC-9). */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <RadioGroupSection />,
};

/**
 * One RadioGroup on the contract with its items from `config.options` (AC-14): `value`, `config`
 * (`options`, `orientation`), `disabled` and `readOnly` are Controls, picking a radio updates the
 * `value` arg, and the "Value:" readout shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>{(field) => <RadioGroup {...args} {...field} />}</Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('null');

    await userEvent.click(canvas.getByRole('radio', { name: 'Compact' }));

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"compact"'),
    );
  },
};

const PLANS = [
  { value: 'starter', title: 'Starter', detail: '1 site, 10 GB media' },
  { value: 'team', title: 'Team', detail: '5 sites, 100 GB media' },
  { value: 'scale', title: 'Scale', detail: 'Unlimited sites, 1 TB media' },
] as const;

/**
 * A RadioGroup whose items are `RadioGroupItem` children with rich content (AC-14): each plan card
 * is a label around one radio, named by the plan title, like the media cards in cms-admin.
 * Selection still flows only through `value`/`onChange`, shown by the same "Value:" readout.
 */
export const WithItems: Story = {
  // The cards are rendered below; `children` is set only to pick the children half of the union.
  args: { 'aria-label': 'Plan', value: 'team', config: { orientation: 'horizontal' }, children: null },
  render: function Render({ value, onChange, config, children: _children, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <RadioGroup {...args} {...field} config={{ orientation: config?.orientation }}>
            {PLANS.map((plan) => (
              <label
                key={plan.value}
                className="bg-card hover:bg-accent has-data-checked:border-primary has-data-checked:ring-primary flex w-48 cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm has-data-checked:ring-2"
              >
                <RadioGroupItem value={plan.value} aria-labelledby={`plan-${plan.value}`} />
                <span>
                  <span id={`plan-${plan.value}`} className="block font-medium">
                    {plan.title}
                  </span>
                  <span className="text-muted-foreground block">{plan.detail}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"team"');

    await userEvent.click(canvas.getByText('Unlimited sites, 1 TB media'));

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"scale"'),
    );
  },
};
