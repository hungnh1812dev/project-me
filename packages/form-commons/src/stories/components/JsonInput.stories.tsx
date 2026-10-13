import type { Meta, StoryObj } from '@storybook/react-vite';

import { JsonInputSection } from '../sections/JsonInputSection';

const meta = {
  title: 'Components/JsonInput',
  component: JsonInputSection,
} satisfies Meta<typeof JsonInputSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Six JSON editors, including the controlled Metadata object demo (AC-9). */
export const AllStates: Story = {};
