import { Badge } from '../../components/ui/badge';

const BADGE_VARIANTS = ['default', 'secondary', 'outline', 'highlight', 'destructive'] as const;

/** The UI kit's Badge section: the five variants (AC-9). */
export const BadgeSection: React.FC = () => (
  <section aria-labelledby="ui-kit-Badge" className="flex flex-col gap-4">
    <h2 id="ui-kit-Badge" className="text-lg font-semibold">
      Badge
    </h2>
    <div className="flex flex-wrap items-center gap-3">
      {BADGE_VARIANTS.map((variant) => (
        <Badge key={variant} variant={variant} className="capitalize">
          {variant}
        </Badge>
      ))}
    </div>
  </section>
);
BadgeSection.displayName = 'BadgeSection';
