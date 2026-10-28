export const MEDIA_COPY = {
  title: 'Media library',
  description:
    'Images, PDFs and videos you can attach to documents. Uploaded images are re-encoded and lose their location data.',
  upload: 'Upload file',
  uploading: (name: string) => `Uploading ${name}...`,
  uploaded: (name: string) => `${name} uploaded.`,
  tableLabel: 'Media files',
  loading: 'Loading media files',
  loadFailed: 'Could not load the media library.',
  forbidden: 'Your role cannot view the media library.',
  empty: 'No files yet',
  emptyHint: 'Upload a file to start the library.',
  emptyHintReadOnly: 'Nothing has been uploaded yet.',
  columns: {
    file: 'File',
    alt: 'Alt text',
    size: 'Size',
    added: 'Added',
    actions: 'Actions',
  },
  noAlt: 'No alt text',
  previewFallback: (name: string) => `Preview of ${name}`,
  editAlt: 'Edit alt',
  deleteAction: 'Delete',
  editAltLabel: (name: string) => `Edit alt text of ${name}`,
  deleteLabel: (name: string) => `Delete ${name}`,
  pagination: {
    label: 'Media pages',
    range: (from: number, to: number, total: number) =>
      `${from}-${to} of ${total}`,
    previous: 'Previous',
    next: 'Next',
  },
  altDialog: {
    title: (name: string) => `Alt text for ${name}`,
    description:
      'Describe the file for people who cannot see it. Leave it empty to clear the text.',
    label: 'Alt text',
    tooLong: (max: number) => `Use at most ${max} characters.`,
    save: 'Save alt text',
    cancel: 'Cancel',
    saved: (name: string) => `Alt text of ${name} saved.`,
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    description:
      'The file leaves the library and can no longer be attached. This cannot be undone.',
    submit: (name: string) => `Delete ${name}`,
    cancel: 'Cancel',
    deleted: (name: string) => `${name} deleted.`,
  },
  errors: {
    inUse:
      'This file is still attached to a document. Remove it from the document first, then delete it.',
    gone: 'This file no longer exists. The list was refreshed.',
    unsupportedType:
      'This file type is not allowed. Use JPEG, PNG, WebP, GIF, AVIF, PDF or MP4.',
    tooLarge:
      'This file is too large. Images may be up to 10 MB, PDFs 20 MB and videos 100 MB.',
    invalidUpload: 'The server could not read this file. Try another one.',
    forbidden: 'Your role is not allowed to do this.',
    retry: 'Try again',
  },
  input: {
    empty: 'No file attached',
    choose: 'Choose from library',
    upload: 'Upload new file',
    replace: 'Replace file',
    remove: 'Remove from field',
    delete: 'Delete from library',
  },
  picker: {
    title: 'Choose a file',
    description: 'Pick a file from the library to attach to this field.',
    loading: 'Loading media files',
    empty: 'The library is empty. Close this and upload a new file.',
    select: (name: string) => `Select ${name}`,
    cancel: 'Cancel',
  },
} as const;
