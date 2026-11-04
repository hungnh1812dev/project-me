# Code style

Part of the [project spec](../../SPEC.md); moved from the old SPEC §10. Global: it applies to every flow in `docs/flows/`.

```ts
// apps/cms-api/src/modules/documents/documents.controller.ts
@Controller(API_ROUTES.DOCUMENTS.ROOT)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Put(API_ROUTES.DOCUMENTS.BY_ID)
  @RequirePermission(PERMISSION_ACTIONS.UPDATE)
  async update(
    @Param() { slug, documentId }: DocumentParamsDto,
    @Body() body: UpdateDocumentDto,
    @Actor() actor: ActorContext,
  ): Promise<SerializedDocument> {
    return this.documents.update({ slug, documentId, ...body }, actor);
  }
}
```

- No literals for routes, limits, headers, cookie names or URLs: they live in the owning module's `*.constants.ts`, in `common/constants/*.constants.ts` when shared, or in config (§5 constants placement; project `code-standards` skill).
- Services take an explicit `ActorContext`. Policy checks live in `access`, never inline `role === 'x'`.
- DTOs validated with Zod (`nestjs-zod`), one schema per DTO; shared schema types are exported for the frontends.
- Prettier, ESLint and Oxlint from `@abyss/base-config` (`/prettier`, `/eslint`, `/oxlint`): the base holds the shared rules; each project extends it locally with its own plugins and rules (React, Next, Nest, Playwright). Built with `tsc` to `dist/` (ESM + `.d.ts`), exports point at `dist/`; turbo builds it before any consumer task (D3).
