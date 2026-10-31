import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@abyss/form-commons';
import { APP_ROUTES } from '@configs/App.routes';
import { REVIEWER_ROLE_SLUG } from '@configs/Auth.constants';
import { COPY } from '@configs/Copy.constants';
import { useCurrentUser, useSession } from '@features/auth';
import { Link } from 'react-router';

const ACCOUNT_LINKS = [
  { path: APP_ROUTES.PROFILE, label: COPY.session.profileLink, isForReviewer: true },
  {
    path: APP_ROUTES.CHANGE_PASSWORD,
    label: COPY.session.changePasswordLink,
    isForReviewer: false,
  },
  { path: APP_ROUTES.SECURITY_SETTINGS, label: COPY.session.securityLink, isForReviewer: false },
] as const;

/** First letters of the first and last word of the name, upper case; the email's first letter when the name is blank. */
export function initialsOf(displayName: string, email = ''): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words.at(-1);
  if (first === undefined || last === undefined) return email.trim().charAt(0).toUpperCase();
  const letters = words.length === 1 ? first.charAt(0) : first.charAt(0) + last.charAt(0);
  return letters.toUpperCase();
}

/** Avatar button at the top right that opens the account menu (Profile, Change password, Security settings, Sign out). */
export function UserMenu() {
  const user = useCurrentUser();
  const session = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  if (!user) return null;
  const isReviewer = user.role === REVIEWER_ROLE_SLUG;
  const links = ACCOUNT_LINKS.filter((link) => !isReviewer || link.isForReviewer);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={COPY.session.accountMenu(user.displayName)}
        className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-foreground outline-none hover:bg-primary/20 focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            <Link to={link.path}>{link.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSigningOut}
          aria-busy={isSigningOut}
          onSelect={() => {
            setIsSigningOut(true);
            // The session ends either way; this component then unmounts.
            void session.signOut();
          }}
        >
          {COPY.session.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
