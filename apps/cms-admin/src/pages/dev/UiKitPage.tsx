import { useState } from 'react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@repo/ui/components/alert-dialog';
import { Button } from '@repo/ui/components/button';
import { Calendar } from '@repo/ui/components/calendar';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@repo/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select';
import { Switch } from '@repo/ui/components/switch';
import { Textarea } from '@repo/ui/components/textarea';

import { DatePicker } from '@/components/form/DatePicker';
import { Field } from '@/components/form/Field';
import { JsonInput } from '@/components/form/JsonInput';
import { PasswordInput } from '@/components/form/PasswordInput';

const VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
const SIZES = ['sm', 'default', 'lg'] as const;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section aria-labelledby={`ui-kit-${title}`} className="flex flex-col gap-4">
    <h2 id={`ui-kit-${title}`} className="text-lg font-semibold">
      {title}
    </h2>
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </section>
);
Section.displayName = 'Section';

/** A controlled JsonInput in a Field, as pages wire it. */
const JsonDemo: React.FC = () => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Field label="Metadata" description="A JSON object." error={error}>
      <JsonInput value={text} onChange={setText} onValidate={setError} expect="object" />
    </Field>
  );
};
JsonDemo.displayName = 'JsonDemo';

/** A controlled DatePicker in a Field, as the filter panel wires it. */
const DatePickerDemo: React.FC = () => {
  const [value, setValue] = useState<Date | undefined>();
  return (
    <Field label="Publish date" description="Opens a calendar; Escape closes it.">
      <DatePicker value={value} onChange={setValue} />
    </Field>
  );
};
DatePickerDemo.displayName = 'DatePickerDemo';

/** The bare Calendar primitive. */
const CalendarDemo: React.FC = () => {
  const [value, setValue] = useState<Date | undefined>();
  return (
    <Calendar
      mode="single"
      selected={value}
      onSelect={setValue}
      aria-label="Calendar example"
      className="rounded-lg border p-3"
    />
  );
};
CalendarDemo.displayName = 'CalendarDemo';

const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '1y', label: '1 year' },
];

/** A Select whose trigger sits in a Field, as forms wire it. */
const SelectDemo: React.FC = () => (
  <Select items={EXPIRY_OPTIONS} defaultValue="1d">
    <Field label="Expires in">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
    </Field>
    <SelectContent>
      {EXPIRY_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
SelectDemo.displayName = 'SelectDemo';

/** `/admin/dev/ui-kit` (development only): every base input and state, for Playwright and axe. */
const UiKitPage: React.FC = () => (
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

    <section aria-labelledby="ui-kit-buttons" className="flex flex-col gap-4">
      <h2 id="ui-kit-buttons" className="text-lg font-semibold">
        Button
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {SIZES.map((size) => (
          <Button key={size} size={size} variant="outline">
            Size {size}
          </Button>
        ))}
        <Button size="icon" aria-label="Add item">
          <PlusIcon aria-hidden="true" />
        </Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled button</Button>
        <Button variant="outline" render={<Link to="/admin" />}>
          Link as button
        </Button>
      </div>
    </section>

    <Section title="Input">
      <Field label="Name" description="Shown on your profile.">
        <Input placeholder="Jane Doe" />
      </Field>
      <Field label="Username">
        <Input defaultValue="jane" />
      </Field>
      <Field label="Disabled input">
        <Input disabled defaultValue="Read only" />
      </Field>
      <Field label="Email" error="Enter a valid email address.">
        <Input type="email" defaultValue="jane@" />
      </Field>
      <Field label="Title" required>
        <Input />
      </Field>
      <Field label="Search">
        <Input type="search" leading={<SearchIcon aria-hidden="true" />} />
      </Field>
      <Field label="Password">
        <PasswordInput autoComplete="new-password" />
      </Field>
    </Section>

    <Section title="Textarea">
      <Field label="Notes">
        <Textarea />
      </Field>
      <Field label="Bio" description="Up to 120 characters.">
        <Textarea maxLength={120} defaultValue="Editor at the CMS." />
      </Field>
      <Field label="Disabled textarea">
        <Textarea disabled defaultValue="Read only" />
      </Field>
      <Field label="Summary" error="The summary is too short.">
        <Textarea defaultValue="Hi" />
      </Field>
      <Field label="Body" required>
        <Textarea />
      </Field>
    </Section>

    <Section title="JsonInput">
      <JsonDemo />
      <Field label="Settings">
        <JsonInput defaultValue='{"theme":"dark"}' />
      </Field>
      <Field label="Disabled JSON">
        <JsonInput disabled defaultValue='{"locked":true}' />
      </Field>
      <Field label="Invalid JSON" error='Invalid JSON: Unexpected token "x"'>
        <JsonInput defaultValue="x" />
      </Field>
      <Field label="Schema" required>
        <JsonInput />
      </Field>
    </Section>

    <Section title="Switch">
      <Field label="Notifications">
        <Switch name="notifications" value="on" />
      </Field>
      <Field label="Published">
        <Switch defaultChecked />
      </Field>
      <Field label="Disabled switch">
        <Switch disabled />
      </Field>
      <Field label="Accept terms" error="You must accept the terms.">
        <Switch />
      </Field>
      <Field label="Visible" required>
        <Switch />
      </Field>
    </Section>

    <Section title="Select">
      <SelectDemo />
      <Select disabled defaultValue="1h" items={EXPIRY_OPTIONS}>
        <Field label="Disabled select">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Field>
      </Select>
    </Section>

    <Section title="Date picker">
      <DatePickerDemo />
      <Field label="Disabled date picker">
        <DatePicker value={new Date(2026, 0, 15)} onChange={() => undefined} disabled />
      </Field>
      <CalendarDemo />
      <div className="flex items-start">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Popover</PopoverTitle>
              <PopoverDescription>Escape or an outside click closes it.</PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      </div>
    </Section>

    <section aria-labelledby="ui-kit-dialogs" className="flex flex-col gap-4">
      <h2 id="ui-kit-dialogs" className="text-lg font-semibold">
        Dialog
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
          <DialogContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Rename item</DialogTitle>
                <DialogDescription>The new name shows everywhere.</DialogDescription>
              </DialogHeader>
              <Field label="Item name">
                <Input defaultValue="Draft" />
              </Field>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Open alert dialog
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete item?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
              <Button variant="destructive">Delete item</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  </section>
);
UiKitPage.displayName = 'UiKitPage';

export default UiKitPage;
