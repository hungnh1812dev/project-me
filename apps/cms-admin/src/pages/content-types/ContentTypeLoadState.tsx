import { ArrowLeftIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@repo/ui/components/button';

import type { ApiError } from '@/core/api/apiError';

const ALERT = 'text-sm text-destructive';
const STATUS = 'text-sm text-muted-foreground';

/** A failed or pending state with a way back: `to` is the page the link returns to. */
export const BackLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Button variant="outline" size="sm" render={<Link to={to} />}>
    <ArrowLeftIcon aria-hidden="true" />
    {children}
  </Button>
);
BackLink.displayName = 'BackLink';

/**
 * What a content-type page shows until its content type (C2) is loaded: the no-access alert on a
 * 403, "Content type not found." with a link to the overview on a 404, a generic alert on any other
 * error, and a status while it loads.
 */
export const ContentTypeLoadState: React.FC<{ error: ApiError | null }> = ({ error }) => {
  if (error?.status === 403)
    return (
      <p role="alert" className={ALERT}>
        You don&apos;t have access to this content type.
      </p>
    );
  if (error?.status === 404)
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className={ALERT}>
          Content type not found.
        </p>
        <BackLink to="/admin/content-types">Back to content types</BackLink>
      </div>
    );
  if (error)
    return (
      <p role="alert" className={ALERT}>
        Couldn&apos;t load this content type.
      </p>
    );
  return (
    <p role="status" className={STATUS}>
      Loading content type…
    </p>
  );
};
ContentTypeLoadState.displayName = 'ContentTypeLoadState';
