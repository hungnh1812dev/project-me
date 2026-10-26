import { COPY } from '../config/Copy.constants';

export default function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {COPY.notFound.title}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {COPY.notFound.description}
      </p>
    </>
  );
}
