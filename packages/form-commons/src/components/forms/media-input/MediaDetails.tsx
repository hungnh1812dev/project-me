import type { MediaInputFile } from './MediaInput';

interface MediaDetailsProps {
  file: Pick<
    MediaInputFile,
    | 'fileName'
    | 'mimeType'
    | 'size'
    | 'provider'
    | 'createdAt'
    | 'sha256'
    | 'updatedAt'
    | 'width'
    | 'height'
  >;
}

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** `1536` -> `1.5 KB`. */
function formatFileSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${SIZE_UNITS[unit]}`;
}

const SHORT_HASH_LENGTH = 8;
const NAME_HASH_SEPARATOR = ' · ';
const DIMENSION_SEPARATOR = ' × ';
const DIMENSION_MIME_PREFIXES = ['image/', 'video/'];

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function hasDimensions(file: MediaDetailsProps['file']): file is MediaDetailsProps['file'] & {
  width: number;
  height: number;
} {
  const mimeType = file.mimeType;
  return (
    mimeType !== undefined &&
    DIMENSION_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) &&
    typeof file.width === 'number' &&
    typeof file.height === 'number'
  );
}

/** Name with short hash, then size, provider, last change and dimensions. */
function MediaDetails({ file }: MediaDetailsProps) {
  const changedAt = file.updatedAt ?? file.createdAt;
  const displayName =
    file.sha256 === undefined || file.sha256 === ''
      ? file.fileName
      : `${file.fileName}${NAME_HASH_SEPARATOR}${file.sha256.slice(0, SHORT_HASH_LENGTH)}`;

  return (
    <div data-slot="media-details" className="grid min-w-0 gap-1">
      <p className="m-0 truncate text-sm font-medium" title={displayName}>
        {displayName}
      </p>
      <p className="text-muted-foreground m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="tabular-nums">{formatFileSize(file.size)}</span>
        {hasDimensions(file) ? (
          <span data-slot="media-dimensions" className="tabular-nums">
            {file.width}
            {DIMENSION_SEPARATOR}
            {file.height}
          </span>
        ) : null}
        {file.provider === undefined ? null : (
          <span
            data-slot="media-provider"
            className="bg-muted rounded-sm px-1.5 py-0.5 font-medium"
          >
            {file.provider}
          </span>
        )}
        <time dateTime={changedAt} className="tabular-nums">
          {dateFormat.format(new Date(changedAt))}
        </time>
      </p>
    </div>
  );
}

export { MediaDetails, formatFileSize, type MediaDetailsProps };
