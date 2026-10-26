import { render, screen } from '@testing-library/react';

import { FormAlert, type FormAlertTone } from './FormAlert';

describe('FormAlert', () => {
  it.each<[FormAlertTone, string]>([
    ['error', 'alert'],
    ['warning', 'alert'],
    ['info', 'status'],
    ['success', 'status'],
  ])('announces the %s tone as %s', (tone, role) => {
    render(<FormAlert tone={tone}>Message</FormAlert>);
    expect(screen.getByRole(role)).toHaveTextContent('Message');
  });

  it('tints the success tone with the success tokens', () => {
    render(<FormAlert tone="success">Saved</FormAlert>);
    expect(screen.getByRole('status')).toHaveClass(
      'bg-success-soft',
      'text-success-strong',
    );
  });
});
