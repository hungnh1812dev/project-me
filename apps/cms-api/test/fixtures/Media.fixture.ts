import sharp from 'sharp';

/** Marker written into EXIF so tests can prove it is gone after re-encoding. */
export const EXIF_MARKER = 'abyss-secret-camera-owner';
const GPS_LATITUDE = '51/1 30/1 0/1';

async function exifJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 4,
      channels: 3,
      background: { r: 200, g: 20, b: 20 },
    },
  })
    .withExif({
      IFD0: { Copyright: EXIF_MARKER, Artist: EXIF_MARKER },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: GPS_LATITUDE },
    })
    .jpeg()
    .toBuffer();
}

function plain(format: 'png' | 'webp' | 'gif' | 'avif'): Promise<Buffer> {
  const image = sharp({
    create: {
      width: 6,
      height: 3,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  });
  return image.toFormat(format).toBuffer();
}

export const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);

/** Smallest buffer `file-type` reads as video/mp4 (an `ftyp` box). */
export const MINIMAL_MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypmp42'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('mp42isom'),
]);

export const HTML_DOCUMENT = Buffer.from(
  '<!doctype html><html><body><script>alert(1)</script></body></html>',
);
export const SVG_DOCUMENT = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>',
);

export interface MediaFixtures {
  readonly exifJpeg: Buffer;
  /** A valid JPEG with an HTML document appended. */
  readonly polyglotJpeg: Buffer;
  readonly png: Buffer;
  readonly webp: Buffer;
  readonly gif: Buffer;
  readonly avif: Buffer;
  /** A JPEG header followed by bytes that do not decode. */
  readonly brokenJpeg: Buffer;
}

export async function buildMediaFixtures(): Promise<MediaFixtures> {
  const exif = await exifJpeg();
  return {
    exifJpeg: exif,
    polyglotJpeg: Buffer.concat([exif, HTML_DOCUMENT]),
    png: await plain('png'),
    webp: await plain('webp'),
    gif: await plain('gif'),
    avif: await plain('avif'),
    brokenJpeg: Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64, 0x41),
    ]),
  };
}
