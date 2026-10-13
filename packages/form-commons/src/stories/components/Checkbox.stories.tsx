import type { Meta, StoryObj } from '@storybook/react-vite';

import { CheckboxSection } from '../sections/CheckboxSection';

const meta = {
  title: 'Components/Checkbox',
  component: CheckboxSection,
} satisfies Meta<typeof CheckboxSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Subscribe, Checked, Some selected (mixed) and Disabled checkbox (AC-9). */
export const AllStates: Story = {};
