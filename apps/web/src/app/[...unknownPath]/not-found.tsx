import { LAST_RESORT_NOT_FOUND_TEXT, NotFoundMessage } from '@/features/not-found/NotFoundMessage';
import { loadNotFoundText } from '@/features/not-found/NotFoundPage.server';

export default async function UnknownPathNotFound() {
  const text = (await loadNotFoundText()) ?? LAST_RESORT_NOT_FOUND_TEXT;
  return <NotFoundMessage text={text} />;
}
