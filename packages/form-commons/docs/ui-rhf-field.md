# UI RHF field

`RHFField` is `Field` bound to react-hook-form through `useController`. It renders the same label, description, required mark and `aria-*` wiring as `Field`, takes the error from `fieldState.error.message`, and hands the bound value props to a render prop.

## Feature

- Props: everything `Field` takes except `error` and `children`, plus `name` (a `FieldPath` of the form values), optional `control` (falls back to `useFormContext()`), optional `rules` (`useController` rules) and optional `schema` (a Standard Schema for this field).
- `children` is a render prop: `(field: RHFFieldRenderProps<TValues, TName>) => ReactElement`. `field` carries `value`, `onChange`, `onBlur`, `name`, `ref` and `disabled` from `useController`. `value` and `onChange` are typed `FieldPathValue<TValues, TName>`, so `{(field) => <Switch {...field} />}` compiles on a `boolean` path and fails on a `string` path.
- The returned element is passed to `Field` as its child, so `Field` still sets `id`, `aria-describedby`, `aria-invalid` and `required` / `aria-required` on it.
- `required` defaults to `!!rules.required`; an explicit `required` wins. A `schema` or a resolver never sets it.
- Validation, three ways that can be mixed: native `rules`; `schema`, any Standard Schema (zod 3.24+ and 4, valibot, ArkType, ...) added to `rules.validate` as `schema` next to a `validate` function (kept as `rule`) or map, so it runs after `required` and the other native rules, its first issue's message is the error, and async schemas are awaited; or a form-level `resolver` from `@hookform/resolvers` (`zodResolver`, `standardSchemaResolver`, ...), which needs no field rules. `schemaRule(schema)` in `lib/standardSchema` is the same check as a plain `validate` function.
- No dependency on a schema library: `lib/standardSchema.ts` copies the Standard Schema 1.1 interface (as the spec invites). zod and `@hookform/resolvers` are devDependencies, for tests and stories only.
- A rules (or resolver) error shows under the control as `role="alert"` and marks the control `aria-invalid="true"`; it clears once the value is valid. `reset()` and `setValue()` update the shown value, because every input is controlled.
- Types are inferred from `control` when it is passed. With `FormProvider` and no `control`, pass the generics (`<RHFField<Values, 'title'> …>`) to get a typed `field`; otherwise the value is `any`.
- Forms that use `required` fields should set `noValidate`, so the browser's own validation does not block react-hook-form's submit.

```tsx
<RHFField control={control} name="published" label="Published">
  {(field) => <Switch {...field} />}
</RHFField>

<RHFField name="title" label="Title" rules={{ required: 'Enter a title.' }}>
  {(field) => <Input {...field} />}
</RHFField>
```

## Files

| File                                   | Spec                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/rhf/RHFField.tsx`      | Exports `RHFField`, `RHFFieldProps` and `RHFFieldRenderProps`. The only place in the package that imports `react-hook-form` (`'use client'` at the top). |
| `src/lib/standardSchema.ts`            | Exports `schemaRule`, `StandardSchemaV1` (copied from `@standard-schema/spec` 1.1) and `RuleResult`. No react-hook-form or schema-library import.        |
| `src/components/rhf/RHFField.test.tsx` | Unit and type tests (see Testing).                                                                                                                       |
| `package.json`                         | Export `./components/rhf/*`; `react-hook-form` as an optional peerDependency (`peerDependenciesMeta`) and a devDependency for tests.                     |

Subpath: `@repo/form-commons/components/rhf/RHFField`. Consumers must install `react-hook-form` themselves (cms-admin does); the frontend does not import this subpath.

## Testing

`src/components/rhf/RHFField.test.tsx`: markup identical to `Field` with the same props; the render prop gets exactly `value`, `onChange`, `onBlur`, `name`, `ref`, `disabled`; a `rules.required` failure on submit shows the alert and `aria-invalid`, and fixing the value clears it; `required` default and override; `reset()` / `setValue()` update the control; explicit `control` without a provider and `FormProvider`; `Switch` on a boolean path; `@ts-expect-error` type tests for a mismatched input (`Switch` on a string path, `Input` on a boolean path) and an unknown path. `src/boundaries.test.ts` allows react-hook-form only under `src/components/rhf/**` and `src/stories/**`. Stories `Components/RHFField`: `Overview` (the guide), `Default` (required text, Switch, Select, JSON; empty submit shows the errors, valid submit shows the values as JSON) with an interact test in `e2e/interact.spec.ts`, and `Playground` (one field with label, description and required message as Controls). `src/lib/standardSchema.test.ts` (zod, async zod and a hand-written schema). `RHFField.test.tsx` also covers a per-field zod `schema`, native rules before the schema, a `validate` function or map kept next to it, an async schema, the required mark, and `zodResolver` and `standardSchemaResolver` at form level; `e2e/interact.spec.ts` drives the Playground in each `validation` mode. Run: `pnpm --filter @repo/form-commons test:cov` (the 70% UI gate applies to `src/components/rhf/**`).

## Related

- [UI form components](./ui-form-components.md) (`Field`), [UI input contract](./ui-input-contract.md), [UI testing and guards](./ui-testing-and-guards.md), [cms-admin Schema form](../../../apps/cms-admin/docs/schema-form.md)
