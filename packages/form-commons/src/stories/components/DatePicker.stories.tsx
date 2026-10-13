import type { Meta, StoryObj } from '@storybook/react-vite';

import { DatePickerSection } from '../sections/DatePickerSection';

const meta = {
  title: 'Components/DatePicker',
  component: DatePickerSection,
} satisfies Meta<typeof DatePickerSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Publish date, Disabled date picker, Calendar example and the Popover (AC-9). */
export const AllStates: Story = {};
