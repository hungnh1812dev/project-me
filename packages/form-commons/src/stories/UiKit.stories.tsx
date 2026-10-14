import type { Meta, StoryObj } from '@storybook/react-vite';

import { BadgeSection } from './sections/BadgeSection';
import { ButtonRolesSection } from './sections/ButtonRolesSection';
import { ButtonSection } from './sections/ButtonSection';
import { CheckboxSection } from './sections/CheckboxSection';
import { ColourSection } from './sections/ColourSection';
import { DataTableSection } from './sections/DataTableSection';
import { DatePickerSection } from './sections/DatePickerSection';
import { DialogSection } from './sections/DialogSection';
import { InputSection } from './sections/InputSection';
import { JsonInputSection } from './sections/JsonInputSection';
import { MediaInputSection } from './sections/MediaInputSection';
import { RadioGroupSection } from './sections/RadioGroupSection';
import { RichTextEditorSection } from './sections/RichTextEditorSection';
import { SelectSection } from './sections/SelectSection';
import { SwitchSection } from './sections/SwitchSection';
import { TextareaSection } from './sections/TextareaSection';

/** Every section on one page, in the order and layout of the former cms-admin UI kit page (AC-9). */
const UiKitOverview: React.FC = () => (
  <section aria-labelledby="ui-kit-title" className="flex flex-col gap-10 p-4 sm:p-6">
    <header className="flex flex-col gap-1">
      <h1 id="ui-kit-title" className="text-2xl font-semibold">
        UI kit
      </h1>
      <p className="text-muted-foreground">
        Development only. Every base input and overlay in its default, filled, disabled, invalid and
        required states.
      </p>
    </header>
    <ButtonSection />
    <ButtonRolesSection />
    <ColourSection />
    <BadgeSection />
    <InputSection />
    <TextareaSection />
    <JsonInputSection />
    <RichTextEditorSection />
    <MediaInputSection />
    <SwitchSection />
    <CheckboxSection />
    <RadioGroupSection />
    <SelectSection />
    <DatePickerSection />
    <DialogSection />
    <DataTableSection />
  </section>
);
UiKitOverview.displayName = 'UiKitOverview';

const meta = {
  title: 'UI kit',
  component: UiKitOverview,
  // The overview carries its own page padding, like the admin page did.
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof UiKitOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All 16 sections under the `h1` "UI kit"; each section is a region named by its `h2` (AC-9). */
export const Overview: Story = {};
