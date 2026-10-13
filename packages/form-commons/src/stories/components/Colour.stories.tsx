import type { Meta, StoryObj } from '@storybook/react-vite';

import { ColourSection } from '../sections/ColourSection';

const meta = {
  title: 'Components/Colour',
  component: ColourSection,
} satisfies Meta<typeof ColourSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The 11 colour-token swatches, each with its `data-swatch` and name (AC-9). */
export const AllStates: Story = {};
