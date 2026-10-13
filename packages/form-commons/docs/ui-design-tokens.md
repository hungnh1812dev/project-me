# UI design tokens

The semantic colour, radius and motion tokens for light and dark, shared by every app that imports `@repo/ui/styles/theme.css`. For anyone changing the palette.

## Feature

- `theme.css` holds the tokens for `:root` and `.dark`, `@custom-variant dark`, the `@theme inline` mapping (including `--color-primary-ink`), the global `:focus-visible` ring and the reduced-motion rule.
- `tokens.ts` mirrors every colour as data, plus the text pairs and control-boundary pairs that must reach 4.5:1 and 3:1. `theme.css` and `tokens.ts` are always changed together; a test keeps them in sync.
- Strapi palette (Strapi Design System scales): `#F6F6F9` page, white cards, `#32324D` text, cool lavender-grey neutrals and an indigo `#4945FF` fill in both themes. `primary-ink` means "primary used as text or as a boundary" (`#4945FF` light, AA-derived `#9A98FF` dark) and drives text, links, focus rings, `highlight` and primary-surface borders. AA-derived values: light `input` `#80809C`, light `warning` `#A14F00`, dark `input` `#8E8EA9`, dark `destructive` `#F38B83`; light `success` `#2F6846` and `destructive` `#B72B1A` use the darker Strapi step. Every text pair reaches 4.59:1 light and 4.89:1 dark; every boundary 3:1. Full table: [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md#tokens-and-palette).
- Decision: tokens live in the shared package, not per app. `apps/frontend` pins `--ring` and `--border` to their old values so the public site does not change ([UI integration](../../../apps/frontend/docs/ui-integration.md)).
- Decision: the dark indigo fill is only 2.99:1 on the page (2.69:1 on cards), so primary surfaces carry a `primary-ink` border (6.94:1 on the dark page) rather than relying on the fill. In light the border matches the fill.

## Files

| File | Spec |
| ---- | ---- |
| `src/styles/theme.css` | CSS variables for both themes, Tailwind `@theme inline` mapping, focus and reduced-motion rules. |
| `src/styles/tokens.ts` | Exports `COLOR_TOKEN_NAMES`, `THEME_TOKENS`, `TEXT_PAIRS`, `UI_BOUNDARY_PAIRS`, `contrastRatio`, `ColorTokenName`, `ThemeName`. Must equal `theme.css`. |

## Testing

- `src/styles/tokens.test.ts`: values match `theme.css`, text pairs 4.5:1, `input`/`ring`/`primary-ink` boundaries 3:1, editor syntax colours 4.5:1 in both themes.
- Run: `pnpm --filter @repo/ui test`.

## Related

- [UI primitives](./ui-primitives.md), [UI JSON editor](./ui-json-editor.md), [UI testing and guards](./ui-testing-and-guards.md)
