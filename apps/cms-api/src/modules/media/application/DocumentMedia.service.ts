import { Inject, Injectable } from '@nestjs/common';

import {
  AccessPolicyService,
  MEDIA_SUBJECT,
  PermissionAction,
  type ActorContext,
} from '../../access';
import {
  ContentRegistry,
  mediaFieldNamesByTable,
  richtextFieldNamesByTable,
  type TableNode,
  type TreeInput,
} from '../../content-engine';
import { mediaRefInvalid, type EmbeddedMedia } from '../domain/Media.entity';
import {
  cloneTree,
  mediaSlots,
  type MediaSlot,
  type TreeNodeLike,
} from '../domain/MediaSlots.rules';
import { mediaIdsInRichtext, rewriteRichtextImages } from '../domain/RichtextImages.rules';
import {
  MEDIA_REPOSITORY,
  MEDIA_STORAGE,
  type MediaRepository,
  type MediaStorage,
} from './Media.port';

/**
 * Document <-> media file mapping. Documents speak the file's public
 * `document_id` (uuid); `media` columns store `file_library.id`. Writes map
 * uuid -> id here, reads embed the file instead of the id. The reference
 * check of a delete (`MediaReferenceChecker`) works on the stored ids.
 */
@Injectable()
export class DocumentMediaService {
  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly repository: MediaRepository,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistry,
  ) {}

  /** Origins a richtext `img` may point to: the active storage's delivery origin. */
  richtextImageOrigins(): readonly string[] {
    return [this.storage.deliveryOrigin];
  }

  /**
   * A copy of the validated tree with every media uuid replaced by the
   * internal id. The file must exist, not be deleted and be readable by the
   * actor (`media` read row filter), else 400. Richtext image ids are checked
   * the same way (the value stays as it is). Needs no `media` permission
   * beyond that.
   */
  async toStored(actor: ActorContext, root: TableNode, tree: TreeInput): Promise<TreeInput> {
    const copy = cloneTree(tree);
    const registry = await this.registry.registry();
    const slots = this.presentSlots(mediaFieldNamesByTable(registry), root, [copy]);
    const richtextImages = this.presentSlots(richtextFieldNamesByTable(registry), root, [copy])
      .map(({ values, name, path }) => ({
        path,
        ids: typeof values[name] === 'string' ? mediaIdsInRichtext(values[name]) : [],
      }))
      .filter(({ ids }) => ids.length > 0);
    if (slots.length === 0 && richtextImages.length === 0) return copy;
    const { evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(actor, PermissionAction.read, MEDIA_SUBJECT);
    const documentIds = [
      ...new Set([
        ...slots.map(({ values, name }) => values[name] as string),
        ...richtextImages.flatMap(({ ids }) => ids),
      ]),
    ];
    const ids = filter.allowed
      ? await this.repository.findReadableIds(documentIds, filter.where)
      : new Map<string, number>();
    for (const { values, name, path } of slots) {
      const id = ids.get(values[name] as string);
      if (id === undefined) throw mediaRefInvalid(path);
      values[name] = id;
    }
    for (const { path, ids: imageIds } of richtextImages) {
      if (imageIds.some((imageId) => !ids.has(imageId))) throw mediaRefInvalid(path);
    }
    return copy;
  }

  /**
   * Replaces, in serialized records, every media value by the embedded file
   * (null when the file is gone), and points every richtext image at its
   * file's current url (removed when the file is gone or not an image).
   * Accepts a stored id or an uuid (the submitted side of a 409). Masked
   * values stay as they are. One batched lookup per call.
   */
  async embed<T extends TreeNodeLike>(root: TableNode, records: readonly T[]): Promise<void> {
    const registry = await this.registry.registry();
    const mediaValueSlots = this.presentSlots(mediaFieldNamesByTable(registry), root, records);
    const richtextSlots = this.presentSlots(richtextFieldNamesByTable(registry), root, records);
    const richtextIds = richtextSlots.flatMap(({ values, name }) =>
      typeof values[name] === 'string' ? mediaIdsInRichtext(values[name]) : [],
    );
    if (mediaValueSlots.length === 0 && richtextSlots.length === 0) return;
    const internalIds = new Set<number>();
    const documentIds = new Set<string>(richtextIds);
    for (const { values, name } of mediaValueSlots) {
      const value = values[name];
      if (typeof value === 'number') internalIds.add(value);
      else if (typeof value === 'string') documentIds.add(value);
    }
    const found =
      internalIds.size + documentIds.size === 0
        ? []
        : await this.repository.findEmbeddable({
            internalIds: [...internalIds],
            documentIds: [...documentIds],
          });
    const byKey = new Map<number | string, EmbeddedMedia>();
    for (const { internalId, file } of found) {
      byKey.set(internalId, file);
      byKey.set(file.id, file);
    }
    for (const { values, name } of mediaValueSlots) {
      values[name] = byKey.get(values[name] as number | string) ?? null;
    }
    const filesById = new Map(found.map(({ file }) => [file.id.toLowerCase(), file]));
    for (const { values, name } of richtextSlots) {
      if (typeof values[name] === 'string') {
        values[name] = rewriteRichtextImages(values[name], filesById);
      }
    }
  }

  private presentSlots(
    fieldsByTable: ReadonlyMap<string, readonly string[]>,
    root: TableNode,
    nodes: readonly TreeNodeLike[],
  ): MediaSlot[] {
    return nodes
      .flatMap((node) => mediaSlots(fieldsByTable, root, node, ''))
      .filter(({ values, name }) => values[name] != null);
  }
}
