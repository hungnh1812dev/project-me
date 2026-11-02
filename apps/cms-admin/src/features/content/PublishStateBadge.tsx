import { COPY } from '@configs/Copy.constants';

import { PUBLISH_STATE, type PublishState } from './Content.constants';

const copy = COPY.content.publishState;

const BADGE_STYLE: Record<PublishState, { label: string; className: string }> = {
  [PUBLISH_STATE.DRAFT]: { label: copy.draft, className: 'bg-muted text-muted-foreground' },
  [PUBLISH_STATE.MODIFIED]: {
    label: copy.modified,
    className: 'bg-warning-soft text-warning-strong',
  },
  [PUBLISH_STATE.PUBLISHED]: {
    label: copy.published,
    className: 'bg-success-soft text-success-strong',
  },
};

/** A document's publish state as text on a tinted chip (edit page header, list column). */
export function PublishStateBadge({ state }: { state: PublishState }) {
  const { label, className } = BADGE_STYLE[state];
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
