import type { Meta, StoryObj } from '@storybook/react-vite';

import { SwitchSection } from '../sections/SwitchSection';

const meta = {
  title: 'Components/Switch',
  component: SwitchSection,
} satisfies Meta<typeof SwitchSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five labelled switches: off, on, disabled, error and required (AC-9). */
export const AllStates: Story = {};
