import { useId, useState, type ReactNode } from 'react';
import { ChevronDownIcon, FileIcon, FilesIcon, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/cn';

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/use-sidebar';

import { useNavModel } from '../hooks/useNavModel';
import type { NavLinkItem } from '../navigation';
import { readFlag, sidebarGroupKey, writeFlag } from '../sidebarState';

interface MenuLink extends NavLinkItem {
  icon?: LucideIcon;
}

const isCurrent = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

/** One link. Active links get `aria-current="page"` (AC-27); the rail shows a tooltip (AC-28). */
const NavItem: React.FC<{ link: MenuLink; icon: LucideIcon }> = ({ link, icon }) => {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const active = isCurrent(pathname, link.to);
  const Icon = link.icon ?? icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={link.label}
        // 44px targets below 1024px (AC-36).
        className="max-lg:h-11"
        render={
          <Link
            to={link.to}
            aria-current={active ? 'page' : undefined}
            // The mobile drawer closes once a link is followed (AC-35).
            onClick={() => isMobile && setOpenMobile(false)}
          />
        }
      >
        <Icon aria-hidden="true" />
        <span>{link.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
NavItem.displayName = 'NavItem';

/** A labelled list of links, with "None" when it is empty (AC-22). */
const LinkList: React.FC<{
  links: readonly MenuLink[];
  icon: LucideIcon;
  /** A visible sub-heading; without it, `labelledBy` names the list. */
  label?: string;
  labelledBy?: string;
}> = ({ links, icon, label, labelledBy }) => {
  const headingId = useId();
  return (
    <>
      {label && (
        <div
          id={headingId}
          className="px-2 pt-2 pb-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden"
        >
          {label}
        </div>
      )}
      <SidebarMenu aria-labelledby={label ? headingId : labelledBy}>
        {links.length === 0 ? (
          <li className="px-2 py-1.5 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
            None
          </li>
        ) : (
          links.map((link) => <NavItem key={link.key} link={link} icon={icon} />)
        )}
      </SidebarMenu>
    </>
  );
};
LinkList.displayName = 'LinkList';

/**
 * A section with a disclosure button (`aria-expanded`) whose open state persists per group
 * (AC-29). In the desktop rail the disclosure is hidden and every item shows as an icon.
 */
const NavGroup: React.FC<{
  id: string;
  label: string;
  children: (buttonId: string) => ReactNode;
}> = ({ id, label, children }) => {
  const key = sidebarGroupKey(id);
  const [open, setOpen] = useState(() => readFlag(key, true));
  const { state, isMobile } = useSidebar();
  const buttonId = useId();
  const panelId = useId();
  const inRail = state === 'collapsed' && !isMobile;

  const toggle = () => {
    writeFlag(key, !open);
    setOpen(!open);
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={
          <button
            type="button"
            id={buttonId}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={toggle}
          />
        }
        className="w-full justify-between group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-lg:h-11"
      >
        {label}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn('transition-transform', !open && '-rotate-90')}
        />
      </SidebarGroupLabel>
      <SidebarGroupContent id={panelId} hidden={!open && !inRail}>
        {children(buttonId)}
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
NavGroup.displayName = 'NavGroup';

/**
 * The side menu (AC-22 to AC-30): the Content section (skeletons, error with Retry, or the
 * Single and Collection groups; hidden without access) and the permission-gated Settings
 * section. Menu gating is defense in depth only: routes keep `RequireAccess`.
 */
const AppSidebar: React.FC = () => {
  const { content, settings, contentStatus, retryContent } = useNavModel();

  return (
    <SidebarContent>
      <nav aria-label="Main">
        {contentStatus !== 'hidden' && (
          <NavGroup id="content" label="Content">
            {() => (
              <>
                {contentStatus === 'loading' && (
                  <div aria-busy="true">
                    <span className="sr-only">Loading content types</span>
                    {[0, 1, 2].map((row) => (
                      <SidebarMenuSkeleton key={row} showIcon />
                    ))}
                  </div>
                )}
                {contentStatus === 'error' && (
                  <div className="flex flex-col items-start gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm text-muted-foreground">Couldn't load content types.</p>
                    <Button variant="outline" size="sm" onClick={retryContent}>
                      Retry
                    </Button>
                  </div>
                )}
                {content && (
                  <>
                    <LinkList label="Single types" links={content.single} icon={FileIcon} />
                    <LinkList
                      label="Collection types"
                      links={content.collection}
                      icon={FilesIcon}
                    />
                  </>
                )}
              </>
            )}
          </NavGroup>
        )}
        {settings.length > 0 && (
          <NavGroup id="settings" label="Settings">
            {(buttonId) => <LinkList links={settings} icon={FileIcon} labelledBy={buttonId} />}
          </NavGroup>
        )}
      </nav>
    </SidebarContent>
  );
};
AppSidebar.displayName = 'AppSidebar';

export default AppSidebar;
