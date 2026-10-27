export const BACKUPS_COPY = {
  nav: 'Backups',
  title: 'Backups',
  description:
    'Nightly database backups, stored off the server. Only the owner can download them.',
  loading: 'Loading backups',
  loadFailed: 'Could not load the backups.',
  forbidden: 'Only the owner can view backups.',
  notConfigured: {
    title: 'Backup storage is not set up on this server',
    hint: 'The backup bucket is connected in the deployment. See “Backup download (cms-admin)” in docs/deployment/k3s-traefik.md.',
  },
  empty: 'No backups yet',
  emptyHint: 'The first backup appears here after the nightly job has run.',
  summary: {
    count: (count: number) => (count === 1 ? '1 backup' : `${count} backups`),
    total: (size: string) => `${size} in total`,
    latest: (date: string) => `Latest ${date}`,
  },
  stale:
    'The newest daily backup is more than a day old. Check that the nightly backup job is running.',
  encryptedNote:
    'These files are encrypted with age. You need the private key you keep offline to open them.',
  tableLabel: 'Backups',
  columns: {
    created: 'Created',
    type: 'Type',
    size: 'Size',
    actions: 'Actions',
  },
  kind: { daily: 'Daily', monthly: 'Monthly' },
  utc: (time: string) => `${time} UTC`,
  download: {
    button: 'Download',
    buttonLabel: (fileName: string) => `Download ${fileName}`,
  },
  dialog: {
    title: (fileName: string) => `Download ${fileName}`,
    description:
      'Confirm with your password and a code. The download link works for one minute.',
    emailCodeSent: 'We sent a code to your email.',
    submit: 'Download',
    cancel: 'Cancel',
    twoFactorOff:
      'Downloading a backup needs two-factor sign-in. Turn it on in your security settings first.',
    openSecurity: 'Open security settings',
    close: 'Close',
  },
} as const;
