# UI design tokens

The semantic colour, radius and motion tokens for light and dark, shared by every app that imports `@repo/ui/styles/theme.css`. For anyone changing the palette.

## Feature

- `theme.css` holds the tokens for `:root` and `.dark`, `@custom-variant dark`, the `@theme inline` mapping (including `--color-primary-ink`), the global `:focus-visible` ring and the reduced-motion rule.
- `tokens.ts` mirrors every colour as data, plus the text pairs and control-boundary pairs that must reach 4.5:1 and 3:1. `theme.css` and `tokens.ts` are always changed together; a test keeps them in sync.
- Luxury palette: off-white page `#FAFAF9`, white cards, charcoal `#2B2B2B` text, warm stone neutrals, metallic gold `#D4AF37` fill and a new deep-gold `primary-ink` (`#7A5C14` light, `#E0C068` dark) for gold text, links, focus rings and gold-surface borders. Full table: [cms-admin Design system](../../../apps/cms-admin/docs/design-system.md#tokens-and-palette).
- Decision: tokens live in the shared package, not per app. `apps/frontend` pins `--ring` and `--border` to their old values so the public site does not change ([UI integration](../../../apps/frontend/docs/ui-integration.md)).
- Decision: the gold fill is only about 2.1:1 on the page, so gold surfaces carry a `primary-ink` border rather than relying on the fill.

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
