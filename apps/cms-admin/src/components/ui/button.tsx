import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import type { VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';

import { buttonVariants } from '@/components/ui/variants';
import { cn } from '@/utils/cn';

type ButtonProps = Omit<ButtonPrimitive.Props, 'render' | 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    /** Shows a spinner, sets `aria-busy` and disables the button, keeping its width. */
    loading?: boolean;
    /**
     * Renders another element (for example `<a href>` or a router `<Link>`) with the button
     * styles. Base UI advises against button semantics on links, so it is rendered as given.
     */
    render?: useRender.RenderProp;
  };

/** Dev-only guard: an icon button needs an accessible name (`aria-label` or `aria-labelledby`). */
function warnIfUnlabelledIcon(props: ButtonProps) {
  if (!import.meta.env.DEV || props.size !== 'icon') return;
  if (props['aria-label'] || props['aria-labelledby']) return;
  console.warn('Button: an icon-size button needs an aria-label (or aria-labelledby).');
}

/** Renders the `render` element with the button styles but without button semantics. */
const LinkButton: React.FC<Omit<ButtonProps, 'render'> & { render: useRender.RenderProp }> = ({
  render,
  className,
  ...props
}) =>
  useRender({
    render,
    props: mergeProps<'a'>({ className }, props as React.ComponentProps<'a'>),
  });
LinkButton.displayName = 'LinkButton';

const Button: React.FC<ButtonProps> = (props) => {
  warnIfUnlabelledIcon(props);
  const {
    className,
    variant,
    size,
    loading = false,
    disabled,
    type = 'button',
    render,
    children,
    ...rest
  } = props;
  const classes = cn(buttonVariants({ variant, size }), className);

  if (render) {
    return (
      <LinkButton render={render} className={classes} {...rest}>
        {children}
      </LinkButton>
    );
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={classes}
      disabled={disabled || loading}
      // Keep focus on a button that turns busy after a click (Base UI loading guidance).
      focusableWhenDisabled={loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <span className="inline-flex items-center gap-2 opacity-0">{children}</span>
          <Loader2Icon
            data-testid="button-spinner"
            aria-hidden="true"
            className="absolute animate-spin"
          />
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
};
Button.displayName = 'Button';

export { Button, type ButtonProps };
