import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { buttonVariants } from '@repo/ui/components/variants';
import { cn } from '@repo/ui/lib/cn';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { Crumb } from '../breadcrumbs';
import { useBreadcrumbs } from '../hooks/useBreadcrumbs';

/** Hidden below 768px when the trail collapses. */
const DESKTOP_ONLY = 'max-md:hidden';

const CrumbItem: React.FC<{ crumb: Crumb; className?: string }> = ({ crumb, className }) => (
  <BreadcrumbItem className={cn('shrink-0', className)}>
    {crumb.to ? (
      <BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
    ) : (
      <span>{crumb.label}</span>
    )}
  </BreadcrumbItem>
);
CrumbItem.displayName = 'CrumbItem';

/** The current page: plain text (the vendored `role="link"` is dropped) that truncates. */
const CurrentItem: React.FC<{ crumb: Crumb }> = ({ crumb }) => (
  <BreadcrumbItem className="min-w-0">
    <BreadcrumbPage role={undefined} aria-disabled={undefined} className="truncate">
      {crumb.label}
    </BreadcrumbPage>
  </BreadcrumbItem>
);
CurrentItem.displayName = 'CurrentItem';

/**
 * The header breadcrumbs (AC-31 to AC-33). Earlier items are links ("Settings" is plain text), and
 * the last is the current page. Below 768px a trail of more than two items shows Home, a "…" menu
 * holding the middle items, and the current page, whose label truncates.
 */
const Breadcrumbs: React.FC = () => {
  const crumbs = useBreadcrumbs();
  const [first, ...rest] = crumbs;
  const current = rest.pop();
  const middle = rest;

  if (!current) {
    return (
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <CurrentItem crumb={first} />
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <CrumbItem crumb={first} />
        <BreadcrumbSeparator />
        {middle.length > 0 && (
          <>
            <BreadcrumbItem className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="More breadcrumbs"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), '-mx-2')}
                >
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {middle.map((crumb) =>
                    crumb.to ? (
                      <DropdownMenuItem key={crumb.label} render={<Link to={crumb.to} />}>
                        {crumb.label}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem key={crumb.label} disabled>
                        {crumb.label}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="md:hidden" />
          </>
        )}
        {middle.map((crumb) => (
          <Fragment key={crumb.label}>
            <CrumbItem crumb={crumb} className={DESKTOP_ONLY} />
            <BreadcrumbSeparator className={DESKTOP_ONLY} />
          </Fragment>
        ))}
        <CurrentItem crumb={current} />
      </BreadcrumbList>
    </Breadcrumb>
  );
};
Breadcrumbs.displayName = 'Breadcrumbs';

export default Breadcrumbs;
