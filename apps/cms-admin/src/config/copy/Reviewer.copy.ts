export const REVIEWER_COPY = {
  banner: {
    title: 'Reviewer mode',
    message:
      'You are looking around as a guest. Everything here is read-only and shows published content only.',
  },
  title: 'Reviewer access',
  description:
    'Let visitors look around read-only for 24 hours. See who asked for access and why.',
  loading: 'Loading reviewer sessions',
  loadFailed: 'Could not load the reviewer sessions.',
  forbidden: 'Your role cannot view reviewer sessions.',
  switch: {
    label: 'Allow reviewer sessions',
    onHint: 'Visitors can request a read-only session on the public site.',
    offHint: 'The public site does not offer reviewer access.',
    loading: 'Checking the current setting',
    loadFailed: 'Could not read the current setting.',
    saveFailed: 'Could not change the setting. Try again.',
    enabled: 'Reviewer access is on.',
    disabled: 'Reviewer access is off. Active reviewer sessions have ended.',
  },
  confirmOff: {
    title: 'Switch off reviewer access?',
    description:
      'Every active reviewer session ends immediately and stays ended if you switch access on again.',
    cancel: 'Keep it on',
    submit: 'Switch off and end sessions',
  },
  tableLabel: 'Reviewer sessions',
  columns: {
    visitor: 'Visitor',
    purposes: 'Purposes',
    notes: 'Notes',
    browser: 'Browser',
    started: 'Started',
    status: 'Status',
  },
  status: { active: 'Active', ended: 'Ended' },
  noPurposes: 'None given',
  noNotes: 'No notes',
  noBrowser: 'Unknown',
  until: (date: string) => `until ${date}`,
  empty: 'No reviewer sessions yet',
  emptyHint:
    'Sessions appear here when a visitor starts one from the public site.',
  pagination: {
    label: 'Reviewer session pages',
    range: (from: number, to: number, total: number) =>
      `${from}\u2013${to} of ${total}`,
    previous: 'Previous',
    next: 'Next',
  },
} as const;
