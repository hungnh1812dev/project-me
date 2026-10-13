import type { Meta, StoryObj } from '@storybook/react-vite';

import { InputSection } from '../sections/InputSection';

const meta = {
  title: 'Components/Input',
  component: InputSection,
} satisfies Meta<typeof InputSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Seven labelled inputs: placeholder, filled, disabled, error, required, search and password (AC-9). */
export const AllStates: Story = {};
