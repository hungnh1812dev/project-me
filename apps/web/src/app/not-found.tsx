import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { loadNotFoundText } from '@/features/not-found/NotFoundPage.server';

export default async function NotFound() {
  const text = (await loadNotFoundText()) ?? LAST_RESORT_TEXT;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{text.notFoundTitle}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.notFoundDescription}</p>
    </>
  );
}
