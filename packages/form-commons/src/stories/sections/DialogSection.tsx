import { useState } from 'react';

import { Field } from '../../components/native/Field';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';

/** The UI kit's Dialog section: "Rename item" and the alert dialog "Delete item?" (AC-9). */
export const DialogSection: React.FC = () => {
  const [name, setName] = useState('Draft');

  return (
    <section aria-labelledby="ui-kit-dialogs" className="flex flex-col gap-4">
      <h2 id="ui-kit-dialogs" className="text-lg font-semibold">
        Dialog
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
          <DialogContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Rename item</DialogTitle>
                <DialogDescription>The new name shows everywhere.</DialogDescription>
              </DialogHeader>
              <Field label="Item name">
                <Input value={name} onChange={setName} />
              </Field>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Open alert dialog
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete item?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
              <Button variant="destructive">Delete item</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
};
DialogSection.displayName = 'DialogSection';
