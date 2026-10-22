import type { ReactNode } from 'react';

export type FormAlertTone = 'error' | 'warning' | 'info';

const TONE_CLASS: Record<FormAlertTone, string> = {
  error: 'bg-destructive-soft text-destructive-strong',
  warning: 'bg-warning-soft text-warning-strong',
  info: 'bg-info-soft text-info-strong',
};

/**
 * Message box above a form. Errors and warnings interrupt screen readers
 * (`alert`); info is announced politely (`status`).
 */
export function FormAlert({
  tone,
  children,
}: {
  tone: FormAlertTone;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'info' ? 'status' : 'alert'}
      className={`rounded-md px-3 py-2 text-sm ${TONE_CLASS[tone]}`}
    >
      {children}
    </p>
  );
}
