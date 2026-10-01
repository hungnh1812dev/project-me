import { useState } from 'react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Field } from '@/components/form/Field';
import { JsonInput } from '@/components/form/JsonInput';
import { PasswordInput } from '@/components/form/PasswordInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

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

/** `/admin/dev/ui-kit` (development only): every base input and state, for Playwright and axe. */
const UiKitPage: React.FC = () => (
  <section aria-labelledby="ui-kit-title" className="flex flex-col gap-10 p-4 sm:p-6">
    <header className="flex flex-col gap-1">
      <h1 id="ui-kit-title" className="text-2xl font-semibold">
        UI kit
      </h1>
      <p className="text-muted-foreground">
        Development only. Every base input in its default, filled, disabled, invalid and required
        states.
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
  </section>
);
UiKitPage.displayName = 'UiKitPage';

export default UiKitPage;
