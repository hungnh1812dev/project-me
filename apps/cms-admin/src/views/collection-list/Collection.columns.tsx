import { Button, type SheetColumn } from '@abyss/form-commons';
import { contentEditPath } from '@configs/App.routes';
import type { ScreenText } from '@configs/locales';
import type { ContentTypeField } from '@features/content-types';
import type { DocumentListItem } from '@features/content/Content.api';
import {
  LIST_MAX_VALUE_COLUMNS,
  LIST_PUBLISH_STATE_KEY,
  LIST_UPDATED_KEY,
} from '@features/content/Content.constants';
import {
  formatListValue,
  isSortableListType,
  listAlignmentOf,
} from '@features/content/Field.registry';
import { PublishStateBadge } from '@features/content/PublishStateBadge';
import { formatDateTime } from '@utils/DateFormat.rules';
import { Link } from 'react-router';

export function listValueFieldsOf(fields: readonly ContentTypeField[]): ContentTypeField[] {
  return fields
    .filter(
      (field) =>
        field.rootScalar && !field.system && !field.component && isSortableListType(field.type),
    )
    .slice(0, LIST_MAX_VALUE_COLUMNS);
}

/** The first value column names a row; without one the document id does. */
export function documentNameOf(
  valueFields: readonly ContentTypeField[],
  row: DocumentListItem,
  text: ScreenText<'content'>,
): string {
  const list = text.content.collection;
  const first = valueFields[0];
  const name =
    first === undefined ? '' : formatListValue(first.type, row.values[first.path], text.content);
  return name === '' || name === list.emptyValue || name === list.protectedValue
    ? `${list.untitled} (${row.documentId.slice(0, 8)})`
    : name;
}

function EditLink({
  slug,
  row,
  children,
}: {
  slug: string;
  row: DocumentListItem;
  children: string;
}) {
  return (
    <Button asChild variant="link" className="h-auto p-0">
      <Link to={contentEditPath(slug, row.documentId)}>{children}</Link>
    </Button>
  );
}

export function collectionColumnsOf(
  slug: string,
  valueFields: readonly ContentTypeField[],
  showPublishState: boolean,
  text: ScreenText<'content'>,
): SheetColumn<DocumentListItem>[] {
  const list = text.content.collection;
  const hasValueColumns = valueFields.length > 0;
  return [
    ...valueFields.map((field, index): SheetColumn<DocumentListItem> => ({
      key: field.path,
      header: field.path,
      sortable: true,
      rowHeader: index === 0,
      align: listAlignmentOf(field.type),
      renderCell: (row) =>
        index === 0 ? (
          <EditLink slug={slug} row={row}>
            {documentNameOf(valueFields, row, text)}
          </EditLink>
        ) : (
          formatListValue(field.type, row.values[field.path], text.content)
        ),
    })),
    ...(showPublishState
      ? [
          {
            key: LIST_PUBLISH_STATE_KEY,
            header: list.columns.status,
            renderCell: (row: DocumentListItem) =>
              row.publishState === undefined ? (
                list.emptyValue
              ) : (
                <PublishStateBadge state={row.publishState} />
              ),
          } satisfies SheetColumn<DocumentListItem>,
        ]
      : []),
    {
      key: LIST_UPDATED_KEY,
      header: list.columns.updated,
      sortable: true,
      rowHeader: !hasValueColumns,
      renderCell: (row) =>
        row.updatedAt === undefined ? (
          list.emptyValue
        ) : hasValueColumns ? (
          formatDateTime(row.updatedAt)
        ) : (
          <EditLink slug={slug} row={row}>
            {formatDateTime(row.updatedAt)}
          </EditLink>
        ),
    },
  ];
}
