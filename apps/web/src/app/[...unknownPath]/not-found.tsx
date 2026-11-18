import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { NotFoundMessage } from '@/features/not-found/NotFoundMessage';
import { loadNotFoundText } from '@/features/not-found/NotFoundPage.server';

export default async function UnknownPathNotFound() {
  const text = (await loadNotFoundText()) ?? LAST_RESORT_TEXT;
  return <NotFoundMessage text={text} />;
}
