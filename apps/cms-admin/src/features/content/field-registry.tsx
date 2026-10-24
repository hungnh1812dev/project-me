import {
  DatePicker,
  DateTimePicker,
  JsonInput,
  NumberInput,
  RichtextInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from '@abyss/form-commons';
import type { ReactNode } from 'react';

import { COPY } from '../../config/copy.constants';
import { FIELD_TYPE, MASKED_VALUE } from '../../config/content.constants';
import { formatDateTime } from '../../lib/date-format';
import { MediaField, mediaToApi, mediaToForm } from '../media';
import {
  booleanToForm,
  datetimeToApi,
  datetimeToForm,
  integerToApi,
  jsonToApi,
  jsonToForm,
  numberToForm,
  textToApi,
  textToForm,
} from './field-values';

const copy = COPY.content;
const listCopy = copy.collection;

export interface FieldRenderProps {
  /** Form path including item indexes (`experience.0.company`). */
  name: string;
  label: string;
}

/** How one scalar field type is shown, edited and sent. */
export interface FieldAdapter {
  /** False: shown read-only and never sent (editor not built yet). */
  editable: boolean;
  toForm: (value: unknown) => unknown;
  /** Form value -> API value; null clears the field. */
  toApi: (value: unknown) => unknown;
  render: (props: FieldRenderProps) => ReactNode;
  /** Text for a present list cell; defaults to plain strings and numbers. */
  formatForList?: (value: unknown) => string | null;
  /** True: the type can be a list column the API sorts by. */
  isSortable?: boolean;
  /** Column alignment in the list; defaults to left. */
  listAlignment?: 'left' | 'right';
}

const identity = (value: unknown): unknown => value ?? null;

const text: FieldAdapter = {
  editable: true,
  isSortable: true,
  toForm: textToForm,
  toApi: textToApi,
  render: ({ name, label }) => <TextInput name={name} label={label} />,
};

const longText: FieldAdapter = {
  ...text,
  render: ({ name, label }) => (
    <TextAreaInput name={name} label={label} rows={4} />
  ),
};

/** Types without an editor yet: shown read-only and never sent. */
const notEditable: FieldAdapter = {
  editable: false,
  toForm: identity,
  toApi: () => undefined,
  render: () => null,
};

function datetimeForList(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDateTime(date);
}

function plainForList(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

/** The single map from field type to its input (SPEC: registry, not a switch). */
export const FIELD_REGISTRY: Readonly<Record<string, FieldAdapter>> = {
  [FIELD_TYPE.STRING]: text,
  [FIELD_TYPE.TEXT]: longText,
  [FIELD_TYPE.INTEGER]: {
    editable: true,
    isSortable: true,
    listAlignment: 'right',
    toForm: numberToForm,
    toApi: integerToApi,
    render: ({ name, label }) => (
      <NumberInput
        name={name}
        label={label}
        mode="integer"
        invalidMessage={copy.invalidInteger}
      />
    ),
  },
  [FIELD_TYPE.DECIMAL]: {
    editable: true,
    isSortable: true,
    listAlignment: 'right',
    toForm: numberToForm,
    toApi: textToApi,
    render: ({ name, label }) => (
      <NumberInput
        name={name}
        label={label}
        mode="decimal"
        invalidMessage={copy.invalidDecimal}
      />
    ),
  },
  [FIELD_TYPE.BOOLEAN]: {
    editable: true,
    isSortable: true,
    formatForList: (value) => (value ? listCopy.yes : listCopy.no),
    toForm: booleanToForm,
    toApi: (value) => value === true,
    render: ({ name, label }) => <SwitchInput name={name} label={label} />,
  },
  [FIELD_TYPE.DATE]: {
    editable: true,
    isSortable: true,
    toForm: textToForm,
    toApi: textToApi,
    render: ({ name, label }) => <DatePicker name={name} label={label} />,
  },
  [FIELD_TYPE.DATETIME]: {
    editable: true,
    isSortable: true,
    formatForList: datetimeForList,
    toForm: datetimeToForm,
    toApi: datetimeToApi,
    render: ({ name, label }) => <DateTimePicker name={name} label={label} />,
  },
  [FIELD_TYPE.JSON]: {
    editable: true,
    toForm: jsonToForm,
    toApi: jsonToApi,
    render: ({ name, label }) => (
      <JsonInput
        name={name}
        label={label}
        rows={4}
        invalidMessage={copy.invalidJson}
      />
    ),
  },
  [FIELD_TYPE.RICHTEXT]: {
    editable: true,
    toForm: textToForm,
    toApi: textToApi,
    render: ({ name, label }) => (
      <RichtextInput name={name} label={label} labels={copy.richtext} />
    ),
  },
  [FIELD_TYPE.MEDIA]: {
    editable: true,
    toForm: mediaToForm,
    toApi: mediaToApi,
    render: ({ name, label }) => <MediaField name={name} label={label} />,
  },
};

/** Adapter for a type; unknown types are read-only rather than guessed. */
export function adapterFor(type: string): FieldAdapter {
  return FIELD_REGISTRY[type] ?? notEditable;
}

export function isSortableListType(type: string): boolean {
  return adapterFor(type).isSortable === true;
}

export function listAlignmentOf(type: string): 'left' | 'right' {
  return adapterFor(type).listAlignment ?? 'left';
}

/** Cell text for a list column: empty and masked values are shared by all types. */
export function formatListValue(type: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return listCopy.emptyValue;
  }
  if (value === MASKED_VALUE) return listCopy.protectedValue;
  const format = adapterFor(type).formatForList ?? plainForList;
  return format(value) ?? listCopy.emptyValue;
}
