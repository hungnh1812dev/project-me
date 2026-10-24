import { COPY } from '../../config/copy.constants';
import {
  REVIEWER_OTHER_VALUE,
  REVIEWER_PURPOSE_TAGS,
  REVIEWER_VISITOR_ROLES,
} from '../../config/reviewer.constants';

export interface ReviewerFormValues {
  role: string;
  roleOther: string;
  purposeChecks: boolean[];
  purposeOtherChecked: boolean;
  purposeOther: string;
  notes: string;
}

type FieldName = keyof ReviewerFormValues | `purposeChecks.${number}`;

/** Fields validated before moving past each step. */
export const STEP_FIELDS: readonly (readonly FieldName[])[] = [
  ['role', 'roleOther'],
  ['purposeOtherChecked', 'purposeOther'],
  ['notes'],
];
export const LAST_STEP = STEP_FIELDS.length - 1;

export const DEFAULT_VALUES: ReviewerFormValues = {
  role: '',
  roleOther: '',
  purposeChecks: REVIEWER_PURPOSE_TAGS.map(() => false),
  purposeOtherChecked: false,
  purposeOther: '',
  notes: '',
};

export const ROLE_OPTIONS = [
  ...REVIEWER_VISITOR_ROLES.map((role) => ({ value: role, label: role })),
  { value: REVIEWER_OTHER_VALUE, label: COPY.reviewer.role.other },
];

/** The request body for the API, from the form's answers. */
export function toSessionInput(values: ReviewerFormValues) {
  const visitorRole = (
    values.role === REVIEWER_OTHER_VALUE ? values.roleOther : values.role
  ).trim();
  const purposeTags = REVIEWER_PURPOSE_TAGS.filter(
    (_, index) => values.purposeChecks[index] === true,
  ) as string[];
  if (values.purposeOtherChecked) purposeTags.push(values.purposeOther.trim());
  const notes = values.notes.trim();
  return { visitorRole, purposeTags, ...(notes === '' ? {} : { notes }) };
}
