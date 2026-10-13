import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextareaSection } from '../sections/TextareaSection';

const meta = {
  title: 'Components/Textarea',
  component: TextareaSection,
} satisfies Meta<typeof TextareaSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five labelled textareas, including the Bio character counter (AC-9). */
export const AllStates: Story = {};
