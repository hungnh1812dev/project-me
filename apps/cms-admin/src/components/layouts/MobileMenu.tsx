import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@abyss/form-commons';
import { COMMON_TEXT } from '@configs/locales';
import type { NavSource } from '@configs/NavSections.constants';

import { SideMenu } from './SideMenu';

const SHEET_CLASS =
  'top-0 left-0 flex h-dvh max-h-none w-72 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-r-lg p-0';

/** The Menu button that opens the side menu as a sheet; the top bar shows it below `md`. */
export function MobileMenu({ nav }: { nav: NavSource }) {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{COMMON_TEXT.nav.menu}</Button>
      </DialogTrigger>
      <DialogContent className={SHEET_CLASS} aria-describedby={undefined}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <DialogTitle className="text-sm">{COMMON_TEXT.app.name}</DialogTitle>
          <DialogClose asChild>
            <Button size="sm">{COMMON_TEXT.nav.closeMenu}</Button>
          </DialogClose>
        </div>
        <SideMenu nav={nav} onNavigate={close} />
      </DialogContent>
    </Dialog>
  );
}
