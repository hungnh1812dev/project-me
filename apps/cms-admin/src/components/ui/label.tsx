import { cn } from '@repo/ui/lib/cn';

const Label: React.FC<React.ComponentProps<'label'>> = ({ className, ...props }) => (
  <label
    data-slot="label"
    className={cn(
      'flex items-center gap-1 text-sm leading-normal font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
      className,
    )}
    {...props}
  />
);
Label.displayName = 'Label';

export { Label };
