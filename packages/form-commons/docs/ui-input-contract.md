# UI input contract

The shared props contract for every value-holding input (`Input`, `Textarea`, `PasswordInput`, `JsonInput`, `Switch`, `Checkbox`, `Select`, `RadioGroup`, `DatePicker`). Inputs are controlled only: the parent owns the value.

## Feature

- `InputValueProps<T>`: required `value: T` and `onChange(value: T)` (the value, never the DOM event), optional `onBlur()` and `name`. There is no `defaultValue`.
- `InputStateProps`: `disabled`, `readOnly`.
- `InputLabelProps`: `aria-label`, `aria-labelledby`, for controls used without a `Field` (for example a search box).
- `InputProps<T, C>`: the above plus `FieldControlProps` (`id`, `required`, `aria-describedby`, `aria-invalid`, `aria-required`, set by `Field` and `RHFField`), one `config?: C`, `className` and `ref`. Arbitrary native props are not part of the public type.
- `C` must extend `JsonConfig` (`{ [key: string]: JsonValue | undefined }`), so a config holds only JSON: no functions, ReactNodes or Dates. Non-JSON options stay as named props on the input (`leading`, `trailing`, JsonInput's `onValidate` / `onValueChange`).
- Config types are type aliases, not interfaces, so they fit the `JsonConfig` index signature.

| Input           | `T`                   | Config type           | Keys                                                                                                                                     |
| --------------- | --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Input`         | `string`              | `InputConfig`         | `type`, `placeholder`, `maxLength`, `minLength`, `autoComplete`, `inputMode`, `pattern`, `spellCheck`, `autoFocus`, `min`, `max`, `step` |
| `PasswordInput` | `string`              | `PasswordInputConfig` | `placeholder`, `autoComplete`                                                                                                            |
| `Textarea`      | `string`              | `TextareaConfig`      | `rows`, `maxLength`, `placeholder`                                                                                                       |
| `JsonInput`     | `string`              | `JsonInputConfig`     | `expect`, `rows`, `label`, `description`                                                                                                 |
| `Switch`        | `boolean`             | `SwitchConfig`        | none                                                                                                                                     |
| `Checkbox`      | `boolean`             | `CheckboxConfig`      | `indeterminate`                                                                                                                          |
| `Select`        | `string \| null`      | `SelectConfig`        | `placeholder`, `options: InputOption[]`                                                                                                  |
| `RadioGroup`    | `string \| null`      | `RadioGroupConfig`    | `options?: InputOption[]` or `RadioGroupItem` children (a union: exactly one), `orientation`                                             |
| `DatePicker`    | `Date \| undefined`   | `DatePickerConfig`    | `locale`, `placeholder`                                                                                                                  |
| `MediaInput`    | `T \| string \| null` | `MediaInputConfig`    | `label` (names the group and its buttons); needs a `MediaProvider`, see [UI media input](./ui-media-input.md)                            |

`isJsonConfig(value)` is the runtime guard: true for a plain object whose values are JSON (`undefined` allowed only for a top-level optional key). It rejects functions, React elements, Dates, class instances, `NaN`/`Infinity`, symbols, bigints, `undefined` inside arrays and cycles. Stories and tests use it to check a config before rendering it.

## Files

| File                       | Spec                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/inputContract.ts` | Exports `JsonPrimitive`, `JsonValue`, `JsonConfig`, `InputValueProps`, `InputStateProps`, `InputLabelProps`, `InputProps`, `InputOption`, the ten config types and `isJsonConfig`. Type-only import of `FieldControlProps`. |

Subpath: `@repo/form-commons/lib/inputContract` (covered by the `./lib/*` export). `apps/frontend/src/ui-compile-check.ts` re-exports it so the frontend `tsc` checks it too.

## Testing

`src/lib/inputContract.test.ts`: every documented config passes a `JSON.parse(JSON.stringify(c))` round trip and `isJsonConfig`; the guard's accept and reject cases; type tests (`expectTypeOf`, `@ts-expect-error`) for required `value`/`onChange`, no `defaultValue`, and a config with a function or Date failing the `JsonConfig` constraint. Run: `pnpm --filter @repo/form-commons test:cov` (the `src/lib/**` 85% gate applies).

## Related

- [UI primitives](./ui-primitives.md), [UI form components](./ui-form-components.md), [UI JSON editor](./ui-json-editor.md), [Storybook](./storybook.md)
