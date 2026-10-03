/**
 * Never imported or rendered. It puts every `@repo/ui` entry under this app's `tsc` (TypeScript 5)
 * so the package source is checked here too; `next build` only compiles files it imports.
 * Add each new `@repo/ui` entry when it lands in the package.
 */
export { Button, type ButtonProps } from '@repo/ui/components/button';
export { buttonVariants, controlClasses } from '@repo/ui/components/variants';
export { cn } from '@repo/ui/lib/cn';
