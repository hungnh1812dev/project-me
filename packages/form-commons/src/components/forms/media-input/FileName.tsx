import { cn } from 'cn';

interface FileNameProps {
  /** The full file name; it stays whole in `title` and in the accessible text. */
  name: string;
  className?: string | undefined;
}

const HASHED_TAIL = /_[0-9a-f]{8}\.[A-Za-z0-9]+$/;
const EXTENSION_TAIL = /\.[A-Za-z0-9]+$/;

/** `photo_a1b2c3d4.jpg` -> head `photo`, tail `_a1b2c3d4.jpg`; no extension -> empty tail. */
function splitFileName(name: string): { head: string; tail: string } {
  const match = HASHED_TAIL.exec(name) ?? EXTENSION_TAIL.exec(name);
  if (match === null || match.index === 0) return { head: name, tail: '' };
  return { head: name.slice(0, match.index), tail: match[0] };
}

/** A file name whose head shrinks with an ellipsis while the tail (hash and extension) stays visible. */
function FileName({ name, className }: FileNameProps) {
  const { head, tail } = splitFileName(name);
  return (
    <span data-slot="file-name" title={name} className={cn('flex min-w-0', className)}>
      <span aria-hidden="true" className="truncate">
        {head}
      </span>
      <span aria-hidden="true" className="shrink-0">
        {tail}
      </span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

export { FileName, splitFileName, type FileNameProps };
