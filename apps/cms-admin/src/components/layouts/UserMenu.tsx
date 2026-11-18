import { useState } from 'react';
import {
  CONTROL_FOCUS_RING_ONLY_CLASSES,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@abyss/form-commons';
import { APP_ROUTES } from '@configs/App.routes';
import { REVIEWER_ROLE_SLUG } from '@configs/Auth.constants';
import { COMMON_TEXT } from '@configs/locales';
import { useCurrentUser, useSession } from '@features/auth';
import { Link } from 'react-router';

import { useConfirmLeave, useGuardedLinkClick } from './LeaveGuard';

const ACCOUNT_LINKS = [
  { path: APP_ROUTES.PROFILE, label: COMMON_TEXT.session.profileLink, isForReviewer: true },
  {
    path: APP_ROUTES.CHANGE_PASSWORD,
    label: COMMON_TEXT.session.changePasswordLink,
    isForReviewer: false,
  },
  {
    path: APP_ROUTES.SECURITY_SETTINGS,
    label: COMMON_TEXT.session.securityLink,
    isForReviewer: false,
  },
] as const;

/** First code point, so an emoji is never split into a lone surrogate. */
function firstLetterOf(text: string): string {
  return Array.from(text)[0] ?? '';
}

/** First letters of the first and last word of the name, upper case; the email's first letter when the name is blank. */
export function initialsOf(displayName: string, email = ''): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words.at(-1);
  if (first === undefined || last === undefined) return firstLetterOf(email.trim()).toUpperCase();
  const letters =
    words.length === 1 ? firstLetterOf(first) : firstLetterOf(first) + firstLetterOf(last);
  return letters.toUpperCase();
}

/** Avatar button at the top right that opens the account menu (Profile, Change password, Security settings, Sign out). */
export function UserMenu() {
  const user = useCurrentUser();
  const session = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const confirmLeave = useConfirmLeave();
  const handleLinkClick = useGuardedLinkClick();
  if (!user) return null;
  const isReviewer = user.role === REVIEWER_ROLE_SLUG;
  const links = ACCOUNT_LINKS.filter((link) => !isReviewer || link.isForReviewer);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={COMMON_TEXT.session.accountMenu(user.displayName)}
        className={`duration-fast flex size-9 items-center justify-center rounded-full bg-nav-active text-sm font-medium text-nav-active-foreground transition-colors hover:bg-muted ${CONTROL_FOCUS_RING_ONLY_CLASSES}`}
      >
        <span aria-hidden="true">{initialsOf(user.displayName, user.email)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="font-medium">{user.displayName}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map((link) => (
          <DropdownMenuItem key={link.path} asChild>
            <Link to={link.path} onClick={(event) => handleLinkClick(event, link.path)}>
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSigningOut}
          aria-busy={isSigningOut}
          onSelect={() => {
            void confirmLeave().then((isConfirmed) => {
              if (!isConfirmed) return;
              setIsSigningOut(true);
              // The session ends either way; this component then unmounts.
              void session.signOut();
            });
          }}
        >
          {COMMON_TEXT.session.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
