import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buttonVariants } from '@/components/ui/variants';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { isThemeChoice, type ThemeChoice } from '@/features/theme/theme';
import { useTheme } from '@/features/theme/useTheme';
import { cn } from '@/utils/cn';

import { getInitials } from '../initials';

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

// Menu rows reach 44px below 1024px (AC-36), denser on desktop.
const ROW = 'min-h-11 px-2 lg:min-h-8';

/**
 * The header's account menu (AC-20): who is signed in, Profile, the Light / Dark / System theme
 * choice, and Log out, which runs the existing `logout` thunk (AC-21). `RequireAuth` then sends
 * the user to `/login` with the current page as `from`.
 */
const UserMenu: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { choice, setChoice } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(buttonVariants({ variant: 'ghost' }), 'gap-2 px-2')}
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {getInitials(user?.name)}
        </span>
        <span className="hidden max-w-40 truncate md:inline">{user?.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
            <span className="truncate text-sm font-medium text-popover-foreground">
              {user?.name}
            </span>
            <span className="truncate text-xs font-normal">{user?.email}</span>
            <span className="text-xs font-normal">{role?.name ?? 'No role'}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ROW} render={<Link to="/admin/profile" />}>
          <UserIcon aria-hidden="true" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={choice}
          onValueChange={(value) => {
            if (isThemeChoice(value)) setChoice(value);
          }}
        >
          <DropdownMenuLabel className="px-2">Theme</DropdownMenuLabel>
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className={ROW}>
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={ROW} onClick={() => void logout()}>
          <LogOutIcon aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
UserMenu.displayName = 'UserMenu';

export default UserMenu;
