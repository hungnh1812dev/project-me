export const CONTENT_COPY = {
  newTitle: (type: string) => `New ${type}`,
  editTitle: (type: string) => `Edit ${type}`,
  description: 'Changes are saved to the draft. Publishing is a separate step.',
  loading: 'Loading the document',
  loadFailed: 'The document could not be loaded.',
  typeNotFound:
    'This content type does not exist, or your role cannot read it.',
  documentNotFound:
    'This document does not exist, or your role cannot read it.',
  retry: 'Try again',
  collection: {
    title: (type: string) => type,
    description: (draftAndPublish: boolean) =>
      draftAndPublish
        ? 'Drafts of this collection. Select rows to publish, unpublish or delete them together.'
        : 'Documents of this collection. Select rows to delete them together.',
    newDocument: 'New document',
    tableLabel: (type: string) => `${type} documents`,
    loading: 'Loading documents',
    loadFailed: 'The documents could not be loaded.',
    forbidden: 'Your role cannot view these documents.',
    notCollection: 'This content type is a single document, not a collection.',
    empty: 'No documents yet',
    emptyHint: 'Create the first document, or import several at once.',
    emptyHintReadOnly: 'Nothing has been created yet.',
    untitled: 'Untitled',
    protectedValue: 'Protected',
    emptyValue: '\u2014',
    yes: 'Yes',
    no: 'No',
    columns: {
      updated: 'Updated',
    },
    selectAll: 'Select all documents on this page',
    selectRow: (name: string) => `Select ${name}`,
    pagination: {
      label: 'Document pages',
      range: (from: number, to: number, total: number) =>
        `${from}\u2013${to} of ${total}`,
      previous: 'Previous',
      next: 'Next',
    },
  },
  bulk: {
    region: 'Actions for the selected documents',
    selected: (count: number) => `${count} selected`,
    clear: 'Clear selection',
    documents: (count: number) =>
      count === 1 ? '1 document' : `${count} documents`,
    publish: (count: number) => `Publish ${count}`,
    unpublish: (count: number) => `Unpublish ${count}`,
    delete: (count: number) => `Delete ${count}`,
    import: 'Import documents',
    summary: {
      publish: (done: number, total: number) =>
        `Published ${done} of ${total} documents.`,
      unpublish: (done: number, total: number) =>
        `Unpublished ${done} of ${total} documents.`,
      delete: (done: number, total: number) =>
        `Deleted ${done} of ${total} documents.`,
      failedHeading: (count: number) =>
        count === 1
          ? '1 document could not be changed'
          : `${count} documents could not be changed`,
      failedItem: (name: string, reason: string) => `${name}: ${reason}`,
      stillSelected: 'The documents that failed stay selected.',
      dismiss: 'Dismiss',
    },
    itemErrors: {
      conflict:
        'Changed by someone else since this list loaded. Review it, then try again.',
      notFound: 'Does not exist any more, or your role cannot reach it.',
      notPublished: 'Is not published, or your role cannot reach it.',
      fallback: 'The server refused this change.',
    },
    errors: {
      forbidden: 'Your role is not allowed to do this.',
      notPublishable: 'This collection has no draft and publish.',
      limit: 'Too many documents in one request. Select fewer and try again.',
      notCollection: 'Bulk actions only work on collections.',
      network: 'The server could not be reached. Nothing was changed.',
      unexpected: 'Something went wrong. Nothing was changed.',
    },
    deleteDialog: {
      title: (count: number) =>
        count === 1 ? 'Delete 1 document?' : `Delete ${count} documents?`,
      description: (draftAndPublish: boolean) =>
        draftAndPublish
          ? 'Drafts and published versions are removed for good. This cannot be undone.'
          : 'They are removed for good. This cannot be undone.',
      confirm: (count: number) =>
        count === 1 ? 'Delete 1 document' : `Delete ${count} documents`,
      cancel: 'Cancel',
    },
    importDialog: {
      title: 'Import documents',
      description: (max: number) =>
        `Paste a JSON array of up to ${max} documents. Each one has the same shape as a single create: { "values": { ... }, "components": { ... } }.`,
      label: 'Documents (JSON)',
      placeholder: '[\n  { "values": { "title": "First" } }\n]',
      invalidJson: 'This is not valid JSON.',
      notArray: 'Use a JSON array: [ { ... }, { ... } ].',
      empty: 'Add at least one document.',
      tooMany: (max: number) => `At most ${max} documents per import.`,
      badItem: (position: number) =>
        `Item ${position} must be an object with "values" and/or "components".`,
      atomic: 'All or nothing',
      atomicHint:
        'Create nothing if any item is invalid. Otherwise valid items are created and invalid ones reported.',
      submit: (count: number) =>
        count === 1 ? 'Import 1 document' : `Import ${count} documents`,
      submitEmpty: 'Import documents',
      cancel: 'Cancel',
      close: 'Close',
      created: (count: number) =>
        count === 1 ? 'Imported 1 document.' : `Imported ${count} documents.`,
      partial: (done: number, failed: number) =>
        `${done} created, ${failed} need fixing. The text now holds only the items that failed, in the same order.`,
      itemError: (position: number, reason: string) =>
        `Item ${position}: ${reason}`,
      atomicFailed: (position: number, reason: string) =>
        `Nothing was created. Item ${position}: ${reason}`,
      invalidFallback: 'is not valid',
    },
  },
  presence: {
    one: (name: string) => `${name} is also on this document.`,
    two: (a: string, b: string) => `${a} and ${b} are also on this document.`,
    many: (a: string, b: string, rest: number) =>
      `${a}, ${b} and ${rest} more are also on this document.`,
  },
  save: 'Save draft',
  saved: 'Draft saved.',
  created: 'Draft created.',
  noFields: 'Your role cannot see any fields of this content type.',
  protectedValue: 'Protected (***)',
  protectedHint: 'Your role cannot read or change this field.',
  notEditableYet: 'Editing this field type is not available yet.',
  emptyValue: 'No value',
  richtext: {
    toolbar: 'Text formatting',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strike: 'Strikethrough',
    code: 'Code',
    heading: 'Heading',
    bulletList: 'Bullet list',
    orderedList: 'Numbered list',
    blockquote: 'Quote',
    link: 'Link',
    unlink: 'Remove link',
    linkPrompt:
      'Link address (https://, mailto: or tel:). Leave empty to remove the link.',
  },
  invalidInteger: 'Enter a whole number, for example 12.',
  invalidDecimal: 'Enter a number, for example 12.5.',
  invalidJson: 'Enter valid JSON, for example ["React", "Node"].',
  protectedGroup: (label: string) =>
    `${label} is protected for your role and is left unchanged.`,
  list: {
    itemTitle: (label: string, index: number) => `${label} ${index + 1}`,
    empty: (label: string) => `No ${label.toLowerCase()} yet.`,
    add: (label: string) => `Add ${label.toLowerCase()}`,
    remove: (label: string, index: number) =>
      `Remove ${label.toLowerCase()} ${index + 1}`,
    moveUp: (label: string, index: number) =>
      `Move ${label.toLowerCase()} ${index + 1} up`,
    moveDown: (label: string, index: number) =>
      `Move ${label.toLowerCase()} ${index + 1} down`,
    removeText: 'Remove',
    upText: 'Up',
    downText: 'Down',
  },
  errors: {
    network:
      'Could not reach the server. Your changes are still here; try saving again.',
    unexpected: 'Something went wrong on our side. Try again in a moment.',
    forbidden: 'Your role is not allowed to save this document.',
    invalid: (detail: string) => `The server rejected the draft: ${detail}`,
    invalidFallback: 'The server rejected the draft. Check the fields.',
    conflict:
      'Someone else saved this document first. Reload to see their version, then apply your changes again.',
    reload: 'Reload latest version',
    reviewConflict: 'Review differences',
  },
  conflict: {
    title: 'Resolve conflicting changes',
    description:
      'Someone saved this document after you opened it. For each difference, choose the version to keep, then save the merged draft.',
    summary: (count: number) =>
      count === 1 ? '1 difference' : `${count} differences`,
    keepAllMine: 'Keep all of mine',
    takeAllSaved: 'Use all saved',
    saved: 'Saved version',
    mine: 'Your version',
    noValue: 'No value',
    save: 'Save merged draft',
    cancel: 'Cancel',
    saving: 'Saving',
    saveFailed:
      'The merged draft could not be saved. Your choices are kept; try again.',
    change: {
      added: 'Added',
      removed: 'Removed',
      changed: 'Changed',
      moved: 'Reordered',
    },
    titleSeparator: ' > ',
    itemTitle: (label: string, position: number) => `${label} ${position}`,
    itemCount: (count: number) => (count === 1 ? '1 item' : `${count} items`),
    itemWithoutFields: 'Empty item',
    order: (positions: readonly number[]) => `Order: ${positions.join(', ')}`,
    yes: 'Yes',
    no: 'No',
  },
} as const;
