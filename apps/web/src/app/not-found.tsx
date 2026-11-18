import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { NotFoundMessage } from '@/features/not-found/NotFoundMessage';

export default function NotFound() {
  return <NotFoundMessage text={LAST_RESORT_TEXT} />;
}
