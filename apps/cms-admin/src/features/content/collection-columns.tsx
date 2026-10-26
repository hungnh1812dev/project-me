import { Button, type SheetColumn } from '@abyss/form-commons';
import { Link } from 'react-router';

import { COPY } from '../../config/Copy.constants';
import { contentEditPath } from '../../config/App.routes';
import type { ContentTypeField } from '../content-types';
import { formatDateTime } from '../../lib/DateFormat.rules';
import type { DocumentListItem } from './content.api';
import { LIST_MAX_VALUE_COLUMNS, LIST_UPDATED_KEY } from './content.constants';
import {
  formatListValue,
  isSortableListType,
  listAlignmentOf,
} from './field-registry';

const list = COPY.content.collection;

export function listValueFieldsOf(
  fields: readonly ContentTypeField[],
): ContentTypeField[] {
  return fields
    .filter(
      (field) =>
        field.rootScalar &&
        !field.system &&
        !field.component &&
        isSortableListType(field.type),
    )
    .slice(0, LIST_MAX_VALUE_COLUMNS);
}

/** The first value column names a row; without one the document id does. */
export function documentNameOf(
  valueFields: readonly ContentTypeField[],
  row: DocumentListItem,
): string {
  const first = valueFields[0];
  const text =
    first === undefined
      ? ''
      : formatListValue(first.type, row.values[first.path]);
  return text === '' || text === list.emptyValue || text === list.protectedValue
    ? `${list.untitled} (${row.documentId.slice(0, 8)})`
    : text;
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
): SheetColumn<DocumentListItem>[] {
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
            {documentNameOf(valueFields, row)}
          </EditLink>
        ) : (
          formatListValue(field.type, row.values[field.path])
        ),
    })),
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
