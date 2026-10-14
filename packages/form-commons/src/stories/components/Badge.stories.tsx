import type { Meta, StoryObj } from '@storybook/react-vite';

import { BadgeSection } from '../sections/BadgeSection';

const meta = {
  title: 'Components/Badge',
  component: BadgeSection,
} satisfies Meta<typeof BadgeSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The five Badge variants (AC-9). */
export const Default: Story = {};
