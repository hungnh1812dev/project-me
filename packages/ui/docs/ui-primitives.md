# UI primitives

The vendored shadcn (Base UI) components and small shared utilities. For anyone building screens in the admin or frontend.

## Feature

- Subpath exports only (`@repo/ui/components/*`), no barrel. Classes always go through `cn()`.
- Button roles map onto existing variants: action = `default` (indigo fill, `primary-ink` border, white label), normal = `outline`, danger = `destructive`; `link` uses `text-primary-ink`. `controlClasses` is the shared input look.
- `Checkbox` supports `indeterminate` (`aria-checked="mixed"`), `primary-ink` checked border and a 44px hit area below `lg`. Native checkboxes are not allowed in admin code.
- `RadioGroup` / `RadioGroupItem` (new): Base UI radio, one tab stop, arrow keys. Callers name the group and each item explicitly (`aria-label` or `aria-labelledby`).
- `Badge` has the destructive pair that passes contrast and a `primary-ink` border on the default variant; `Switch` and the selected `Calendar` day carry `border-primary-ink` (primary-border rule).
- Why: a wrapping `<label>` does not name a non-native `role="checkbox"`, hence the explicit names.

## Files

| File | Spec |
| ---- | ---- |
| `src/components/variants.ts` | Exports `buttonVariants`, `controlClasses`. The three button roles and shared control styling. |
| `src/components/checkbox.tsx` | Exports `Checkbox`, `CheckboxProps`. Indigo checked/mixed state, 44px hit area, invalid border. |
| `src/components/radio-group.tsx` | Exports `RadioGroup`, `RadioGroupItem` and prop types. Same indigo checked style as checkbox. |
| `src/components/badge.tsx` | Exports `Badge`. Variants incl. `highlight` and `destructive`. |
| `src/components/switch.tsx` | Exports `Switch`. Checked state has `primary-ink` border. |
| `src/components/calendar.tsx` | Exports `Calendar`, `CalendarDayButton`. Selected day has `primary-ink` border. |
| `src/components/button.tsx` | Exports `Button`. Variants from `variants.ts`, `loading` spinner with `aria-busy`. |
| `src/components/alert-dialog.tsx`, `alert.tsx`, `breadcrumb.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `label.tsx`, `popover.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`, `table.tsx`, `textarea.tsx`, `tooltip.tsx` | Unchanged shadcn primitives, token-styled. |
| `src/lib/cn.ts` | Exports `cn`: clsx plus tailwind-merge. |
| `src/hooks/use-mobile.ts` | Exports `useIsMobile`. |
| `src/hooks/use-sidebar.ts` | Exports `SidebarContext`, `useSidebar`, `SidebarContextProps`. |

## Testing

- `src/form/__tests__/Checkbox.test.tsx`, `RadioGroup.test.tsx`, `Badge.test.tsx`, `buttonVariants.test.ts`, `Button.test.tsx`, `Input.test.tsx`, `Switch.test.tsx`, `Textarea.test.tsx`, `SidebarMenuButton.test.tsx`: states, names, mixed state, variants.
- `src/lib/cn.test.ts`, `src/hooks/use-mobile.test.ts`.
- Run: `pnpm --filter @repo/ui test`.

## Related

- [UI design tokens](./ui-design-tokens.md), [UI testing and guards](./ui-testing-and-guards.md)
- Used by [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md)
