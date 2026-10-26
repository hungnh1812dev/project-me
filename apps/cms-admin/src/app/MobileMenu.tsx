import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@abyss/form-commons';
import { useState } from 'react';

import { COPY } from '../config/copy.constants';
import { AppNameLink, SideMenu } from './SideMenu';

const SHEET_CLASS =
  'top-0 left-0 flex h-dvh max-h-none w-72 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-r-lg p-0';

/** Below `md`: a top bar whose Menu button opens the side menu as a sheet. */
export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 md:hidden">
      <AppNameLink />
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size="sm">{COPY.access.nav.menu}</Button>
        </DialogTrigger>
        <DialogContent className={SHEET_CLASS} aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <DialogTitle className="text-sm">{COPY.app.name}</DialogTitle>
            <DialogClose asChild>
              <Button size="sm">{COPY.access.nav.closeMenu}</Button>
            </DialogClose>
          </div>
          <SideMenu onNavigate={close} />
        </DialogContent>
      </Dialog>
    </header>
  );
}
