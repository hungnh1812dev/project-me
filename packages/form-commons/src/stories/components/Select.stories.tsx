import type { Meta, StoryObj } from '@storybook/react-vite';

import { SelectSection } from '../sections/SelectSection';

const meta = {
  title: 'Components/Select',
  component: SelectSection,
} satisfies Meta<typeof SelectSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Expires in" (1 hour, 1 day, 1 year) and "Disabled select" (AC-9). */
export const AllStates: Story = {};
