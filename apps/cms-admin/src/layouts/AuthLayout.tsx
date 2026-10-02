import { LayersIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';

interface AuthLayoutProps {
  /** The page heading (the only `<h1>`). */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Secondary links under the card body, such as "Back to sign in". */
  footer?: React.ReactNode;
  /** The card body; left out when null (for example `/403` without a reason). */
  children?: React.ReactNode;
}

/**
 * The signed-out pages and `/403` (AC-41, AC-44): a centred Card at most 400px wide with the
 * product mark and the page title. Below 640px it fills the full width.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ title, description, footer, children }) => (
  <main className="grid min-h-svh bg-muted/40 sm:place-items-center sm:p-6">
    <Card className="w-full max-w-[400px] gap-6 py-6 [--card-spacing:--spacing(6)] max-sm:max-w-none max-sm:rounded-none max-sm:ring-0">
      <CardHeader className="gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LayersIcon aria-hidden="true" className="size-4" />
          </span>
          hungnhdev CMS
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">{title}</h1>
        {description != null && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children != null && children !== false && (
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      )}
      {footer != null && (
        <CardFooter className="flex-col items-start gap-1 bg-transparent">{footer}</CardFooter>
      )}
    </Card>
  </main>
);
AuthLayout.displayName = 'AuthLayout';

export default AuthLayout;
