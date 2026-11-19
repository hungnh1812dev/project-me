import { LAST_RESORT_NOT_FOUND_TEXT, NotFoundMessage } from '@/features/not-found/NotFoundMessage';

export default function NotFound() {
  return <NotFoundMessage text={LAST_RESORT_NOT_FOUND_TEXT} />;
}
