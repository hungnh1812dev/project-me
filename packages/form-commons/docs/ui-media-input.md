# UI media input

`MediaInput`, a media field control with a picker and upload, fed by a `MediaProvider`. The package owns the UI; each app supplies its library, upload, permissions and image URL rule through the provider, so nothing here fetches.

## Feature

- `MediaProvider value={source}` puts a `MediaSource<T>` in context; `useMediaSource()` reads the nearest one and throws "MediaInput needs a <MediaProvider> above it." outside one. Wrap the app, a page, a form or a single field.
- `MediaSource<T>`: `items` (`undefined` while loading), `error` (`forbidden` hides Retry), `refetch`, `describe(asset) => MediaFile` (`id`, `fileName`, `url`, optional `thumbnailUrl`, `width`, `height`, `size`), `canBrowse` and `canUpload` (`Decision`), `upload(files) => { added, summary } | null`, `uploads` (`FileStatusItem[]`), `uploading`, `accept`, `uploadHint`, and optional `imageSrc(url)`.
- The app keeps its own asset type `T`: the value is the asset object, and `describe` maps it for display.
- `MediaInput<T>` is on the [input contract](./ui-input-contract.md): `value: T | string | null` (a string is an id resolved through `items`), `onChange(T | null)`, `config.label` (`MediaInputConfig`), `readOnly` (hides the buttons), `disabled`, Field wiring, and `onAnnounce(message)` for "<label> set to <file>." and "<label> removed.". The group is named by `aria-labelledby`, else by `config.label`.
- A 320px preview box with the full `url` (`contain`), or the loading, empty or "File not found" state; then the file name, "W × H" and `formatBytes(size)` when known. Choose is a `GatedButton` on `canBrowse`; Remove clears the value and moves focus to Choose.
- `MediaPickerDialog<T>`: upload (`FileDropzone` gated by `canUpload`; the first asset a batch adds becomes the choice), a file-name search with a live count, the list states (loading, error with Retry, empty, no matches), and a `RadioGroup` card grid where the arrow keys move the choice and Enter confirms.
- Images: `MediaImage` only puts a URL in `<img src>` when `imageSrc` accepts it (default `defaultImageSrc`: `https:` or the page's own origin), with `referrerPolicy="no-referrer"`; anything else is a placeholder named after the file, with no request.

## Files

| File                                                               | Spec                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/components/forms/MediaInput.tsx`                              | Exports `MediaInput`, `MediaInputProps`. Preview, details, Choose and Remove.                                        |
| `src/components/forms/MediaPickerDialog.tsx`                       | Exports `MediaPickerDialog`, `MediaPickerDialogProps`. Mount with a fresh `key` per opening.                         |
| `src/components/forms/MediaProvider.tsx`                           | Exports `MediaProvider`, `MediaProviderProps`.                                                                       |
| `src/components/forms/MediaImage.tsx`                              | Exports `MediaImage`, `MediaImageProps`.                                                                             |
| `src/hooks/use-media-source.ts`                                    | Exports `useMediaSource`, `MediaSourceContext`, `MediaSource`, `MediaUploadResult`.                                  |
| `src/lib/media.ts`                                                 | Exports `resolveMedia`, `filterMedia`, `formatBytes`, `defaultImageSrc`, `MediaFile`, `MediaValue`, `ResolvedMedia`. |
| `src/stories/DemoMediaProvider.tsx`, `src/stories/mediaLibrary.ts` | The in-memory demo library (SVG data-URL images, a blob-URL upload) for stories.                                     |

## Testing

`src/components/forms/MediaInput.test.tsx` (states, Remove, read-only, gating, the picker's choice, Enter, search, list states, upload) and `src/lib/media.test.ts`. Stories: `Components/MediaInput` `AllStates` and `Playground`, and the MediaInput section of the UI kit overview. `e2e/interact.spec.ts` picks by keyboard, removes and uploads in the Playground; `e2e/a11y.spec.ts` runs axe and the keyboard walk on it. cms-admin keeps the field, permission, CSP and API tests (`MediaField.test.tsx`, `e2e/schema-form.spec.ts`, `e2e/content-permissions.spec.ts`, `e2e/csp.spec.ts`).

## Related

- [UI form components](./ui-form-components.md) (`FileDropzone`, `GatedButton`), [UI input contract](./ui-input-contract.md), [Storybook](./storybook.md)
- [cms-admin Schema form](../../../apps/cms-admin/docs/schema-form.md) (`MediaField`, `CmsMediaProvider`)
