import { APP_ROUTES } from '@configs/App.routes';
import { COMMON_TEXT, useScreenText } from '@configs/locales';
import { useCurrentUser } from '@features/auth';
import { ArrowUpRight, FileText, Image as ImageIcon, Shield, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

import { StatusCard } from './StatusCard';

export function StatusPage() {
  const { page } = useScreenText('status');
  const user = useCurrentUser();

  const QUICK_ACTIONS = [
    {
      title: COMMON_TEXT.nav.schemaBuilder,
      description: 'Design and manage data schemas, fields, and custom content models.',
      path: APP_ROUTES.SCHEMA_BUILDER,
      icon: FileText,
      badge: 'Schema',
    },
    {
      title: COMMON_TEXT.nav.media,
      description: 'Upload, inspect, preview, and organize all media and static assets.',
      path: APP_ROUTES.MEDIA,
      icon: ImageIcon,
      badge: 'Assets',
    },
    {
      title: COMMON_TEXT.nav.accounts,
      description: 'Manage administrator accounts, invitations, roles, and API tokens.',
      path: APP_ROUTES.ACCOUNTS,
      icon: Shield,
      badge: 'Access',
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-surface border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-control bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {COMMON_TEXT.app.name} Console
            </span>
            {user ? (
              <span className="inline-flex items-center rounded-control bg-muted px-2 py-0.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Signed in as {user.displayName} ({user.role})
              </span>
            ) : null}
          </div>
          <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {page.title}
          </h1>
          <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {page.description}
          </p>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <section aria-labelledby="quick-access-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="quick-access-heading" className="m-0 text-base font-semibold text-foreground">
            Quick Actions
          </h2>
          <span className="text-xs text-muted-foreground">
            Shortcuts to common administration tasks
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {QUICK_ACTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="group duration-fast relative flex flex-col justify-between gap-4 rounded-surface border border-border bg-card p-5 shadow-card transition-all hover:border-primary/50 hover:shadow-card-hover"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-control bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon aria-hidden="true" className="size-5" />
                    </div>
                    <span className="rounded-control bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <div>
                    <h3 className="m-0 text-sm font-semibold text-foreground group-hover:text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="duration-fast flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-1">
                  <span>Open</span>
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Health & Status Monitoring */}
      <section aria-labelledby="system-status-heading" className="flex flex-col gap-4">
        <h2 id="system-status-heading" className="m-0 text-base font-semibold text-foreground">
          System Overview
        </h2>
        <StatusCard />
      </section>
    </div>
  );
}
