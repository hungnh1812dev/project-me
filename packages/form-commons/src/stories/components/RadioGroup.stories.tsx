import type { Meta, StoryObj } from '@storybook/react-vite';

import { RadioGroupSection } from '../sections/RadioGroupSection';

const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroupSection,
} satisfies Meta<typeof RadioGroupSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The "Density" group with Comfortable, Compact and Spacious (AC-9). */
export const AllStates: Story = {};
