import { Inject, Injectable } from '@nestjs/common';

import {
  AccessPolicyService,
  MEDIA_SUBJECT,
  PermissionAction,
  type ActorContext,
} from '../../access';
import { ContentRegistry, mediaFieldNamesByTable } from '../../content-engine';
import type { TableNode, TreeInput } from '../../content-engine';
import { mediaRefInvalid, type EmbeddedMedia } from '../domain/Media.entity';
import {
  cloneTree,
  mediaSlots,
  type MediaSlot,
  type TreeNodeLike,
} from '../domain/MediaSlots.rules';
import { MEDIA_REPOSITORY, type MediaRepository } from './Media.port';

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
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistry,
  ) {}

  private async slotsOf(
    root: TableNode,
    nodes: readonly TreeNodeLike[],
  ): Promise<MediaSlot[]> {
    const mediaFields = mediaFieldNamesByTable(await this.registry.registry());
    return nodes.flatMap((node) => mediaSlots(mediaFields, root, node, ''));
  }

  /**
   * A copy of the validated tree with every media uuid replaced by the
   * internal id. The file must exist, not be deleted and be readable by the
   * actor (`media` read row filter), else 400. Needs no `media` permission
   * beyond that.
   */
  async toStored(
    actor: ActorContext,
    root: TableNode,
    tree: TreeInput,
  ): Promise<TreeInput> {
    const copy = cloneTree(tree);
    const slots = (await this.slotsOf(root, [copy])).filter(
      ({ values, name }) => values[name] !== null,
    );
    if (slots.length === 0) return copy;
    const { evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(
      actor,
      PermissionAction.read,
      MEDIA_SUBJECT,
    );
    const documentIds = [
      ...new Set(slots.map(({ values, name }) => values[name] as string)),
    ];
    const ids = filter.allowed
      ? await this.repository.findReadableIds(documentIds, filter.where)
      : new Map<string, number>();
    for (const { values, name, path } of slots) {
      const id = ids.get(values[name] as string);
      if (id === undefined) throw mediaRefInvalid(path);
      values[name] = id;
    }
    return copy;
  }

  /**
   * Replaces, in serialized records, every media value by the embedded file
   * (null when the file is gone). Accepts a stored id or an uuid (the
   * submitted side of a 409). Masked values (`null`) stay as they are.
   */
  async embed<T extends TreeNodeLike>(
    root: TableNode,
    records: readonly T[],
  ): Promise<void> {
    const slots = await this.slotsOf(root, records);
    const present = slots.filter(({ values, name }) => values[name] != null);
    if (present.length === 0) return;
    const internalIds = new Set<number>();
    const documentIds = new Set<string>();
    for (const { values, name } of present) {
      const value = values[name];
      if (typeof value === 'number') internalIds.add(value);
      else if (typeof value === 'string') documentIds.add(value);
    }
    const found = await this.repository.findEmbeddable({
      internalIds: [...internalIds],
      documentIds: [...documentIds],
    });
    const byKey = new Map<number | string, EmbeddedMedia>();
    for (const { internalId, file } of found) {
      byKey.set(internalId, file);
      byKey.set(file.id, file);
    }
    for (const { values, name } of present) {
      values[name] = byKey.get(values[name] as number | string) ?? null;
    }
  }
}
