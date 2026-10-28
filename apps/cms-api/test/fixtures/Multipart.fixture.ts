const CRLF = '\r\n';

export interface MultipartFile {
  readonly field: string;
  readonly fileName: string;
  readonly contentType?: string;
  readonly data: Buffer;
}

export interface MultipartBody {
  readonly contentType: string;
  readonly body: Buffer;
}

const BOUNDARY = '----abyss-test-boundary';

/** Builds a multipart/form-data body from text fields and file parts, in order. */
export function multipart(
  parts: readonly (
    { readonly field: string; readonly value: string } | MultipartFile
  )[],
): MultipartBody {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    if ('value' in part) {
      chunks.push(
        Buffer.from(
          `--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="${part.field}"${CRLF}${CRLF}${part.value}${CRLF}`,
        ),
      );
    } else {
      chunks.push(
        Buffer.from(
          `--${BOUNDARY}${CRLF}Content-Disposition: form-data; name="${part.field}"; filename="${part.fileName}"${CRLF}Content-Type: ${part.contentType ?? 'application/octet-stream'}${CRLF}${CRLF}`,
        ),
        part.data,
        Buffer.from(CRLF),
      );
    }
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--${CRLF}`));
  return {
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
    body: Buffer.concat(chunks),
  };
}
