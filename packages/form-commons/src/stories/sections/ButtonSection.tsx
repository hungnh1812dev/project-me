import { PlusIcon } from 'lucide-react';

import { Button } from '../../components/ui/button';

const VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
const SIZES = ['sm', 'default', 'lg'] as const;

/** The UI kit's Button section: six variants, three sizes, icon, loading, disabled and link (AC-9). */
export const ButtonSection: React.FC = () => (
  <section aria-labelledby="ui-kit-buttons" className="flex flex-col gap-4">
    <h2 id="ui-kit-buttons" className="text-lg font-semibold">
      Button
    </h2>
    <div className="flex flex-wrap items-center gap-3">
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {SIZES.map((size) => (
        <Button key={size} size={size} variant="outline">
          Size {size}
        </Button>
      ))}
      <Button size="icon" aria-label="Add item">
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button loading>Saving</Button>
      <Button disabled>Disabled button</Button>
      {/* A plain anchor instead of react-router's Link: stories never import from apps. */}
      <Button variant="outline" render={<a href="#" />}>
        Link as button
      </Button>
    </div>
  </section>
);
ButtonSection.displayName = 'ButtonSection';
