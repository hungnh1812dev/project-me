import { COPY } from '../configs/Copy.constants';

export default function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{COPY.notFound.title}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{COPY.notFound.description}</p>
    </>
  );
}
