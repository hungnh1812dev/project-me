import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Field } from '../../components/native/Field';
import { MediaInput, type MediaInputProps } from '../../components/native/MediaInput';
import { Controlled, useArgsValue } from '../Controlled';
import { DemoMediaProvider } from '../DemoMediaProvider';
import type { DemoAsset } from '../mediaLibrary';
import { MediaInputSection } from '../sections/MediaInputSection';

type DemoMediaInputProps = MediaInputProps<DemoAsset>;

/** MediaInput on the demo library, in a Field, as a page wires it. */
const DemoMediaInput: React.FC<DemoMediaInputProps> = (props) => (
  <DemoMediaProvider>
    <Field label={props.config?.label ?? 'Cover image'}>
      <MediaInput<DemoAsset> {...props} />
    </Field>
  </DemoMediaProvider>
);
DemoMediaInput.displayName = 'DemoMediaInput';

const meta = {
  title: 'Components/MediaInput',
  component: DemoMediaInput,
  args: {
    value: null,
    onChange: fn(),
    onAnnounce: fn(),
    config: { label: 'Cover image' },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'object' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof DemoMediaInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty, chosen, not found, read-only, loading and Choose denied, on the demo library. */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <MediaInputSection />,
};

/**
 * One MediaInput on the contract: `value` (an asset, an id or `null`), `config`, `disabled` and
 * `readOnly` are Controls. Choosing in the picker (or uploading a PNG or JPEG) updates the
 * `value` arg, and the "Value:" readout shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange as (next: typeof value) => void);
    return <Controlled {...bind}>{(field) => <DemoMediaInput {...args} {...field} />}</Controlled>;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Choose Cover image' }));
    // The picker is a dialog portalled to the body.
    const body = canvasElement.ownerDocument.body;
    const dialog = await waitFor(() => {
      const found = body.querySelector<HTMLElement>('[role="dialog"]');
      if (!found) throw new Error('picker not open yet');
      return found;
    });
    await userEvent.click(dialog.querySelector<HTMLElement>('[aria-labelledby$="-media-logo"]')!);
    await userEvent.click(
      [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Select')!,
    );

    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"logo.png"'),
    );
  },
};
