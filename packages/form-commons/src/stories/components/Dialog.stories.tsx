import type { Meta, StoryObj } from '@storybook/react-vite';

import { DialogSection } from '../sections/DialogSection';

const meta = {
  title: 'Components/Dialog',
  component: DialogSection,
} satisfies Meta<typeof DialogSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The "Rename item" dialog and the "Delete item?" alert dialog (AC-9). */
export const AllStates: Story = {};
