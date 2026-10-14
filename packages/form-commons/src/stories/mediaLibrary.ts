import type { MediaFile } from '../lib/media';

/** A demo asset, shaped like an app's own asset type (not `MediaFile`). */
export interface DemoAsset {
  documentId: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
  url: string;
}

/** An SVG image as a data URL: a coloured card with a caption, so stories need no network. */
const swatch = (label: string, background: string, width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="100%" height="100%" fill="${background}"/>` +
      `<text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${Math.round(height / 8)}" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
      `</svg>`,
  )}`;

const asset = (
  documentId: string,
  fileName: string,
  background: string,
  width: number,
  height: number,
  size: number,
): DemoAsset => ({
  documentId,
  fileName,
  width,
  height,
  size,
  url: swatch(fileName, background, width, height),
});

export const DEMO_ASSETS: readonly DemoAsset[] = [
  asset('media-cover', 'cover.png', '#4945ff', 1200, 630, 184_320),
  asset('media-team', 'team-photo.jpg', '#328048', 800, 800, 1_258_291),
  asset('media-logo', 'logo.png', '#d02b20', 512, 512, 20_480),
  asset('media-banner', 'spring-banner.jpg', '#ac5e00', 1600, 400, 402_653),
];

export const describeDemoAsset = (demo: DemoAsset): MediaFile => ({
  id: demo.documentId,
  fileName: demo.fileName,
  url: demo.url,
  // Uploaded demo files have no measured size.
  ...(demo.width > 0 && { width: demo.width, height: demo.height }),
  size: demo.size,
});

/** Demo images are data and blob URLs, which the default `https:`-only check refuses. */
export const demoImageSrc = (url: string | undefined) =>
  url && /^(data:image\/svg\+xml,|blob:)/.test(url) ? url : null;
