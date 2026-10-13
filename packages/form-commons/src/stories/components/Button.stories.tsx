import type { Meta, StoryObj } from '@storybook/react-vite';

import { ButtonSection } from '../sections/ButtonSection';

const meta = {
  title: 'Components/Button',
  component: ButtonSection,
} satisfies Meta<typeof ButtonSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Six variants, three sizes, the icon button, loading, disabled and "Link as button" (AC-9). */
export const AllStates: Story = {};
