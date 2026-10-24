const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

/** The viewer's locale, e.g. "Oct 24, 2026". */
export const formatDate = (value: Date | string | number): string =>
  dateFormat.format(new Date(value));

/** Date and short time in the viewer's locale. */
export const formatDateTime = (value: Date | string | number): string =>
  dateTimeFormat.format(new Date(value));

/** Time with seconds in the viewer's locale. */
export const formatTime = (value: Date | string | number): string =>
  timeFormat.format(new Date(value));
