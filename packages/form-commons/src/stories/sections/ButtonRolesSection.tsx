import { Button } from '../../components/ui/button';

/** The three button roles (AC-8): Action is the indigo fill, Normal the outline, Danger destructive. */
const BUTTON_ROLES = [
  { name: 'Action', variant: 'default' },
  { name: 'Normal', variant: 'outline' },
  { name: 'Danger', variant: 'destructive' },
] as const;

/** The UI kit's Button roles section: each role in default, disabled and loading (AC-9). */
export const ButtonRolesSection: React.FC = () => (
  <section aria-labelledby="ui-kit-button-roles" className="flex flex-col gap-4">
    <h2 id="ui-kit-button-roles" className="text-lg font-semibold">
      Button roles
    </h2>
    <p className="text-muted-foreground">
      Action for the one main step, Normal for everything else, Danger for removing things. Hover or
      Tab to a button to see its hover and focus states.
    </p>
    {BUTTON_ROLES.map(({ name, variant }) => (
      <div key={name} className="flex flex-wrap items-center gap-3">
        <Button variant={variant}>{name}</Button>
        <Button variant={variant} disabled>
          {name} disabled
        </Button>
        <Button variant={variant} loading>
          {name} loading
        </Button>
      </div>
    ))}
  </section>
);
ButtonRolesSection.displayName = 'ButtonRolesSection';
