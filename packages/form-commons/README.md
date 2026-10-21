# @abyss/form-commons

Shared UI kit for `cms-admin` and `web`: shadcn/ui primitives, form building
blocks for react-hook-form, and the design tokens. Consumers import from
`dist/` only (run `pnpm --filter @abyss/form-commons build`, or let Turborepo
build it first through `^build`).

## Exports

| Import                           | What                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@abyss/form-commons`            | `Button`, `Input`, `Label`, `Field`, `TextInput`, `SelectInput`, `CheckboxInput`, `Checkbox`, `NativeSelect`, `Dialog*`, `FIELD_ID_SUFFIX` (ESM + CJS + d.ts) |
| `@abyss/form-commons/styles.css` | Compiled CSS: tokens + the utilities the components use, no reset                                                                                             |
| `@abyss/form-commons/theme.css`  | Tailwind v4 `@theme` mapping + tokens, for apps that run Tailwind                                                                                             |
| `@abyss/form-commons/tokens.css` | CSS variables only                                                                                                                                            |

JS has no side effects (`sideEffects` lists only CSS), so unused components
are tree-shaken.

### Using it in an app with Tailwind v4

```css
@import 'tailwindcss';
@import '@abyss/form-commons/theme.css';
@source '../node_modules/@abyss/form-commons/dist';
```

### Using it without Tailwind

```ts
import '@abyss/form-commons/styles.css';
```

## Tokens

`src/styles/tokens.css` has two layers: primitives (`--abyss-*`, never used
in components) and semantic tokens (`--primary`, `--destructive-soft`, ...).
Components use semantic Tailwind classes only (`bg-primary`,
`text-destructive-strong`). Status colors come as solid, `-soft` (tinted
background) and `-strong` (text on soft) variants.

## Components

### Button

Variants follow what the action does: `primary` (the one main action of a
view), `secondary` (default), `success`, `warning`, `destructive` (confirm
first), `ghost`, `link`. Sizes `sm | md | lg | icon`. `loading` keeps the
width, shows a spinner, sets `aria-busy` and disables the button.
Icon-only buttons need an `aria-label`.

### Field

Layout and a11y wiring for any control:

```tsx
<Field
  label="Email"
  description="We send the invite here."
  error={error}
  required
>
  {(control) => <Input {...control} type="email" />}
</Field>
```

`control` carries `id`, `aria-invalid`, `aria-describedby` (description id,
then error id) and `aria-required`.

### TextInput

`Field` + `Input` registered with the surrounding `FormProvider`. Works with
RHF native rules and with a Zod resolver:

```tsx
const form = useForm({ resolver: zodResolver(schema), mode: 'onTouched' });

<FormProvider {...form}>
  <form noValidate onSubmit={form.handleSubmit(save)}>
    <TextInput name="email" label="Email" type="email" required />
    <TextInput name="name" label="Name" rules={{ required: 'Enter a name.' }} />
  </form>
</FormProvider>;
```

`required` (or `rules.required`) shows the marker and sets `aria-required`;
the native `required` attribute is never set, so the browser bubble does not
compete with the inline error. Use `mode: 'onTouched'` for validation after
blur.

### SelectInput and CheckboxInput

`SelectInput` is a native `<select>` inside `Field` (`options`, optional
`placeholder` as the empty first option), registered with the surrounding
`FormProvider` like `TextInput`. `CheckboxInput` binds a Radix `Checkbox` to a
boolean field; the box sits left of its label, description and error below.

### Dialog

shadcn `Dialog` (Radix): focus trap, inert page behind, Esc closes, focus
returns to the trigger. Compose `DialogContent`, `DialogHeader`,
`DialogTitle` (required for accessibility), `DialogDescription` and
`DialogFooter` (secondary left, primary right, end-aligned). Put a
`DialogClose` Cancel button in the footer; there is no corner close button.

## Adding shadcn components

```bash
pnpm --filter @abyss/form-commons exec shadcn add <name>
```

Then restyle to semantic tokens and export it from `src/index.ts`.

## Scripts

| Script      | What it does                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| `build`     | tsup (ESM, CJS, d.ts) + Tailwind CLI for `dist/styles.css`                    |
| `test`      | Vitest + Testing Library (jsdom)                                              |
| `lint`      | Oxlint (react, jsx-a11y, vitest) then ESLint (typescript-eslint, react-hooks) |
| `typecheck` | `tsc --noEmit`                                                                |
