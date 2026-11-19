import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';

import type { NotFoundText } from './NotFoundPage.graphql';

export const LAST_RESORT_NOT_FOUND_TEXT: NotFoundText = {
  title: LAST_RESORT_TEXT.notFoundTitle,
  description: LAST_RESORT_TEXT.notFoundDescription,
};

export function NotFoundMessage({ text }: { text: NotFoundText }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{text.title}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.description}</p>
    </>
  );
}
