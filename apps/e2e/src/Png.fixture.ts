import { deflateSync } from 'node:zlib';

const PNG_SIDE = 8;
const COLOR_RANGE = 256;
const RGB_BYTES = 3;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BIT_DEPTH = 8;
const PNG_COLOR_TYPE_RGB = 2;

const crcTable = Array.from({ length: COLOR_RANGE }, (_, n) => {
  let c = n;
  for (let k = 0; k < PNG_SIDE; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> PNG_SIDE);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
/** A small PNG whose bytes differ per seed, so no two uploads share a hash. */
export const pngOf = (seed: number): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(PNG_SIDE, 0);
  header.writeUInt32BE(PNG_SIDE, 4);
  header[8] = PNG_BIT_DEPTH;
  header[9] = PNG_COLOR_TYPE_RGB;
  const pixel = [seed % COLOR_RANGE, (seed * 7) % COLOR_RANGE, (seed * 13) % COLOR_RANGE];
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: PNG_SIDE * RGB_BYTES }, (_, i) => pixel[i % RGB_BYTES] ?? 0)),
  ]);
  const raw = Buffer.concat(Array.from({ length: PNG_SIDE }, () => row));
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
