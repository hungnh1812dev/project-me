import { COPY } from '@configs/Copy.constants';
import { render, screen } from '@testing-library/react';

import { PUBLISH_STATE } from './Content.constants';
import { PublishStateBadge } from './PublishStateBadge';

const copy = COPY.content.publishState;

describe('PublishStateBadge', () => {
  it.each([
    [PUBLISH_STATE.DRAFT, copy.draft, 'bg-muted'],
    [PUBLISH_STATE.MODIFIED, copy.modified, 'bg-warning-soft'],
    [PUBLISH_STATE.PUBLISHED, copy.published, 'bg-success-soft'],
  ])('shows %s as text on its own tint', (state, label, tint) => {
    render(<PublishStateBadge state={state} />);
    expect(screen.getByText(label)).toHaveClass(tint);
  });
});
