import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

/** Reads PDF files with poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and `strings`; specs skip where `hasPdfTools` is false. */
export const hasPdfTools = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

export const pdfStrings = (path: string): string =>
  execFileSync('strings', [path], { encoding: 'utf8' });

export const pdfInfo = (path: string): Record<string, string> =>
  Object.fromEntries(
    execFileSync('pdfinfo', [path], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.includes(':'))
      .map((line) => {
        const at = line.indexOf(':');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );

export const pdfText = (path: string): string =>
  execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });

const INK_THRESHOLD = 200;
const PAPER_THRESHOLD = 254;

export interface PageInk {
  /** First and last row, first and last column holding text-dark pixels. */
  ink: { top: number; bottom: number; left: number; right: number };
  /** Whether the very first row and the left and right edge columns carry a tint (the band). */
  tintAtTop: boolean;
  tintAtEdges: boolean;
}

/** Rasterises each page at 72 dpi (1 px = 1 pt) and reads where its ink and tint are. */
export const pdfPageInk = (path: string, outputDir: string): PageInk[] => {
  const prefix = `${outputDir}/raster`;
  execFileSync('pdftoppm', ['-gray', '-r', '72', path, prefix]);
  return readdirSync(outputDir)
    .filter((name) => name.startsWith('raster') && name.endsWith('.pgm'))
    .sort()
    .map((name) => {
      const file = readFileSync(`${outputDir}/${name}`);
      const size = file.toString('latin1').split('\n', 3)[1];
      const [width, height] = (size ?? '').split(' ').map(Number) as [number, number];
      const pixels = file.subarray(file.length - width * height);
      const at = (x: number, y: number) => pixels[y * width + x] ?? 255;
      let top = height;
      let bottom = 0;
      let left = width;
      let right = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (at(x, y) < INK_THRESHOLD) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      }
      return {
        ink: { top, bottom, left, right },
        tintAtTop: at(Math.floor(width / 2), 0) < PAPER_THRESHOLD,
        tintAtEdges: at(0, 1) < PAPER_THRESHOLD && at(width - 1, 1) < PAPER_THRESHOLD,
      };
    });
};
