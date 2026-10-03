import { useRef, useState } from 'react';
import { CopyIcon, EllipsisIcon, PencilIcon, SendIcon, Trash2Icon, UndoIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@repo/ui/components/button';

import { GatedMenuItem } from '@/components/form/GatedMenuItem';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDuplicateDocument,
  usePublishDocument,
  useUnpublishDocument,
} from '@/features/content/hooks/useCollectionMutations';
import { useContentTypeAccess } from '@/features/content/hooks/useContentTypeAccess';
import type { ContentTypeRef, ListedDocumentItem } from '@/features/content/types';

import { actionErrorText } from '../actionError';
import { documentPath } from '../paths';
import { DeleteDocumentDialog } from './DeleteDocumentDialog';

export interface RowActionsProps {
  type: ContentTypeRef;
  item: ListedDocumentItem;
  /** The row's name, as in its link and checkbox. */
  label: string;
  /** Reports an action's outcome: announced on success, shown as an alert when `error`. */
  onResult: (message: string, error?: boolean) => void;
  /**
   * Where focus goes after a confirmed delete, since this row (and its Actions button) is going
   * away. `null`, or leaving it out, keeps the default: back to the Actions button.
   */
  focusAfterDelete?: () => HTMLElement | null;
}

/** 44px rows below `lg`, denser on desktop. */
const ROW = 'min-h-11 px-2 lg:min-h-8';

/**
 * A row's "Actions for <label>" menu (SPEC "Row actions"): Edit, Duplicate (D8), Publish or
 * Unpublish by status (D6, D7, only with draft and publish) and Delete (D5, confirmed). A denied
 * item stays in the menu, `aria-disabled` with its reason, and does nothing. Outcomes go to
 * `onResult`; the list refetches through the hooks' invalidation.
 */
export const RowActions: React.FC<RowActionsProps> = ({
  type,
  item,
  label,
  onResult,
  focusAfterDelete,
}) => {
  const access = useContentTypeAccess(type);
  const duplicate = useDuplicateDocument(type);
  const publish = usePublishDocument(type);
  const unpublish = useUnpublishDocument(type);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleted = useRef(false);
  const { documentId, status } = item;

  const run = (mutation: typeof publish | typeof duplicate, done: string) =>
    mutation.mutate(documentId, {
      onSuccess: () => onResult(done),
      onError: (error) => onResult(actionErrorText(error), true),
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Actions for ${label}`} />}
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className={ROW}
            render={<Link to={documentPath(type.slug, documentId)} />}
          >
            <PencilIcon aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <GatedMenuItem
            decision={access.create}
            onClick={() => run(duplicate, `Copy of "${label}" created.`)}
          >
            <CopyIcon aria-hidden="true" />
            Duplicate
          </GatedMenuItem>
          {type.draftToPublish && status !== 'published' && (
            <GatedMenuItem
              decision={access.publish}
              onClick={() => run(publish, `"${label}" published.`)}
            >
              <SendIcon aria-hidden="true" />
              Publish
            </GatedMenuItem>
          )}
          {type.draftToPublish && status !== 'draft' && (
            <GatedMenuItem
              decision={access.unpublish}
              onClick={() => run(unpublish, `"${label}" unpublished.`)}
            >
              <UndoIcon aria-hidden="true" />
              Unpublish
            </GatedMenuItem>
          )}
          <DropdownMenuSeparator />
          <GatedMenuItem
            decision={access.delete}
            variant="destructive"
            onClick={() => {
              deleted.current = false;
              setDeleteOpen(true);
            }}
          >
            <Trash2Icon aria-hidden="true" />
            Delete
          </GatedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDocumentDialog
        type={type}
        documentId={documentId}
        label={label}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          deleted.current = true;
          onResult(`"${label}" deleted.`);
        }}
        finalFocus={() => (deleted.current ? (focusAfterDelete?.() ?? true) : true)}
      />
    </>
  );
};
RowActions.displayName = 'RowActions';
