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
import { FIELD_TYPE } from '../../config/content.constants';
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
}

const identity = (value: unknown): unknown => value ?? null;

const text: FieldAdapter = {
  editable: true,
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

/** media (T29) arrives with its editor. */
const notEditable: FieldAdapter = {
  editable: false,
  toForm: identity,
  toApi: () => undefined,
  render: () => null,
};

/** The single map from field type to its input (SPEC: registry, not a switch). */
export const FIELD_REGISTRY: Readonly<Record<string, FieldAdapter>> = {
  [FIELD_TYPE.STRING]: text,
  [FIELD_TYPE.TEXT]: longText,
  [FIELD_TYPE.INTEGER]: {
    editable: true,
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
    toForm: booleanToForm,
    toApi: (value) => value === true,
    render: ({ name, label }) => <SwitchInput name={name} label={label} />,
  },
  [FIELD_TYPE.DATE]: {
    editable: true,
    toForm: textToForm,
    toApi: textToApi,
    render: ({ name, label }) => <DatePicker name={name} label={label} />,
  },
  [FIELD_TYPE.DATETIME]: {
    editable: true,
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
  [FIELD_TYPE.MEDIA]: notEditable,
};

/** Adapter for a type; unknown types are read-only rather than guessed. */
export function adapterFor(type: string): FieldAdapter {
  return FIELD_REGISTRY[type] ?? notEditable;
}
