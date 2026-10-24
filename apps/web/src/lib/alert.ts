export type AlertTone = 'error' | 'warning';

/** A message with the tone of the alert that shows it. */
export interface Alert {
  tone: AlertTone;
  message: string;
}
