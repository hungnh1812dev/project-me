import { EN_TEXT } from '@configs/locales/en';
import { render, screen } from '@testing-library/react';

import { PUBLISH_STATE } from './Content.constants';
import { PublishStateBadge } from './PublishStateBadge';

const copy = EN_TEXT.content.publishState;

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
