/**
 * Never imported or rendered. It puts every `@repo/form-commons` entry under this app's `tsc` (TypeScript 5)
 * so the package source is checked here too; `next build` only compiles files it imports.
 * Add each new `@repo/form-commons` entry when it lands in the package.
 */
export { Button, type ButtonProps } from '@repo/form-commons/components/button';
export { buttonVariants, controlClasses } from '@repo/form-commons/components/variants';
export { cn } from '@repo/form-commons/lib/cn';
export * as alert from '@repo/form-commons/components/alert';
export * as alertDialog from '@repo/form-commons/components/alert-dialog';
export * as badge from '@repo/form-commons/components/badge';
export * as breadcrumb from '@repo/form-commons/components/breadcrumb';
export * as calendar from '@repo/form-commons/components/calendar';
export * as card from '@repo/form-commons/components/card';
export * as checkbox from '@repo/form-commons/components/checkbox';
export * as dialog from '@repo/form-commons/components/dialog';
export * as dropdownMenu from '@repo/form-commons/components/dropdown-menu';
export * as input from '@repo/form-commons/components/input';
export * as label from '@repo/form-commons/components/label';
export * as popover from '@repo/form-commons/components/popover';
export * as radioGroup from '@repo/form-commons/components/radio-group';
export * as select from '@repo/form-commons/components/select';
export * as separator from '@repo/form-commons/components/separator';
export * as sheet from '@repo/form-commons/components/sheet';
export * as sidebar from '@repo/form-commons/components/sidebar';
export * as skeleton from '@repo/form-commons/components/skeleton';
export * as switchControl from '@repo/form-commons/components/switch';
export * as table from '@repo/form-commons/components/table';
export * as textarea from '@repo/form-commons/components/textarea';
export * as tooltip from '@repo/form-commons/components/tooltip';
export * as useMobile from '@repo/form-commons/hooks/use-mobile';
export * as useSidebar from '@repo/form-commons/hooks/use-sidebar';
export * as confirmDialog from '@repo/form-commons/form/ConfirmDialog';
export * as datePicker from '@repo/form-commons/form/DatePicker';
export * as field from '@repo/form-commons/form/Field';
export * as fileDropzone from '@repo/form-commons/form/FileDropzone';
export * as gatedButton from '@repo/form-commons/form/GatedButton';
export * as gatedMenuItem from '@repo/form-commons/form/GatedMenuItem';
export * as jsonInput from '@repo/form-commons/form/JsonInput';
export * as pagination from '@repo/form-commons/form/Pagination';
export * as passwordInput from '@repo/form-commons/form/PasswordInput';
export * as secretReveal from '@repo/form-commons/form/SecretReveal';
export * as unsavedChangesDialog from '@repo/form-commons/form/UnsavedChangesDialog';
export type { Decision } from '@repo/form-commons/lib/decision';
export * as json from '@repo/form-commons/lib/json';
export * as paginationHelpers from '@repo/form-commons/lib/pagination';
