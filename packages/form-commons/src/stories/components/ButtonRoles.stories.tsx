import type { Meta, StoryObj } from '@storybook/react-vite';

import { ButtonRolesSection } from '../sections/ButtonRolesSection';

const meta = {
  title: 'Components/Button roles',
  component: ButtonRolesSection,
} satisfies Meta<typeof ButtonRolesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Action, Normal and Danger in default, disabled and loading states (AC-9). */
export const AllStates: Story = {};
