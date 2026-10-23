import { BadRequestException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { PermissionAction } from '../../generated/prisma/client';
import {
  MEDIA_SUBJECT,
  AccessPolicyService,
  type ActorContext,
} from '../access';
import {
  ContentDbProvider,
  ContentRegistryProvider,
  mediaFieldNamesByTable,
} from '../content-engine';
import type { TableNode } from '../content-engine';
import type { FieldValues, TreeInput } from '../content-engine';
import {
  DELETED_AT_COLUMN,
  MEDIA_REF_ERROR_CODES,
  MEDIA_TABLE,
  mediaRefInvalidMessage,
} from './media.constants';

/** A file as a document read embeds it. The internal integer id is never part of it. */
export interface EmbeddedMedia {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: string;
  readonly alt: string | null;
  readonly size: number;
  readonly createdAt: string;
}

/** Any node of a tree: root, component item, input or serialized. */
interface TreeNodeLike {
  values?: FieldValues | undefined;
  components?:
    Record<string, readonly TreeNodeLike[] | null | undefined> | undefined;
}

type MediaSlot = { values: FieldValues; name: string; path: string };

/** Every `media` field value in the tree, with its input path. */
function mediaSlots(
  mediaFields: ReadonlyMap<string, readonly string[]>,
  table: TableNode,
  node: TreeNodeLike,
  path: string,
  out: MediaSlot[] = [],
): MediaSlot[] {
  if (node.values !== undefined) {
    for (const name of mediaFields.get(table.plan.name) ?? []) {
      if (name in node.values) {
        out.push({
          values: node.values,
          name,
          path: `${path}values.${name}`,
        });
      }
    }
  }
  for (const { field, table: child } of table.components) {
    (node.components?.[field.name] ?? []).forEach((item, index) =>
      mediaSlots(
        mediaFields,
        child,
        item,
        `${path}components.${field.name}[${index}].`,
        out,
      ),
    );
  }
  return out;
}

/** Copies the levels the walk may write to (values objects); same-realm plain objects. */
function cloneTree<T extends TreeNodeLike>(node: T): T {
  const copy: TreeNodeLike = { ...node };
  if (node.values !== undefined) copy.values = { ...node.values };
  if (node.components !== undefined) {
    copy.components = Object.fromEntries(
      Object.entries(node.components).map(([name, items]) => [
        name,
        items?.map((item) => cloneTree(item)),
      ]),
    );
  }
  return copy as T;
}

const FILE_COLUMNS = [
  'id',
  'document_id',
  'file_name',
  'url',
  'thumbnail_url',
  'provider',
  'alt',
  'size',
  'created_at',
] as const;

/**
 * Document <-> media file mapping (T29). Documents speak the file's public
 * `document_id` (uuid); `media` columns store `file_library.id`. Writes map
 * uuid -> id here, reads embed the file instead of the id. The reference
 * check of a delete (`media-references.ts`) works on the stored ids.
 */
@Injectable()
export class MediaRefsService {
  constructor(
    private readonly content: ContentDbProvider,
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistryProvider,
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
    const uuids = [
      ...new Set(slots.map(({ values, name }) => values[name] as string)),
    ];
    const rows = filter.allowed
      ? await this.content.db
          .selectFrom(MEDIA_TABLE)
          .select(['id', 'document_id'])
          .where('document_id', '=', sql<string>`any(${uuids}::uuid[])`)
          .where(DELETED_AT_COLUMN, 'is', null)
          .$if(filter.where !== null, (qb) =>
            qb.where(filter.where as NonNullable<typeof filter.where>),
          )
          .execute()
      : [];
    const ids = new Map(
      rows.map((row) => [row.document_id as string, row.id as number]),
    );
    for (const { values, name, path } of slots) {
      const id = ids.get(values[name] as string);
      if (id === undefined) {
        throw new BadRequestException({
          errorCode: MEDIA_REF_ERROR_CODES.INVALID,
          message: mediaRefInvalidMessage(path),
        });
      }
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
    const ints = new Set<number>();
    const uuids = new Set<string>();
    for (const { values, name } of present) {
      const value = values[name];
      if (typeof value === 'number') ints.add(value);
      else if (typeof value === 'string') uuids.add(value);
    }
    const base = () =>
      this.content.db
        .selectFrom(MEDIA_TABLE)
        .select([...FILE_COLUMNS])
        .where(DELETED_AT_COLUMN, 'is', null);
    const found = [
      ...(ints.size > 0
        ? await base()
            .where('id', '=', sql<number>`any(${[...ints]}::int[])`)
            .execute()
        : []),
      ...(uuids.size > 0
        ? await base()
            .where('document_id', '=', sql<string>`any(${[...uuids]}::uuid[])`)
            .execute()
        : []),
    ];
    const byKey = new Map<number | string, EmbeddedMedia>();
    for (const row of found) {
      const file: EmbeddedMedia = {
        id: row.document_id as string,
        fileName: row.file_name as string,
        url: row.url as string,
        thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
        provider: row.provider as string,
        alt: (row.alt as string | null) ?? null,
        size: row.size as number,
        createdAt: (row.created_at as Date).toISOString(),
      };
      byKey.set(row.id as number, file);
      byKey.set(file.id, file);
    }
    for (const { values, name } of present) {
      values[name] = byKey.get(values[name] as number | string) ?? null;
    }
  }
}
