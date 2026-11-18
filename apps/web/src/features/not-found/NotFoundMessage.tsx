import type { NotFoundText } from './NotFoundPage.graphql';

export function NotFoundMessage({ text }: { text: NotFoundText }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{text.notFoundTitle}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.notFoundDescription}</p>
    </>
  );
}
