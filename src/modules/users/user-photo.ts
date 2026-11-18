/** Largest accepted profile photo. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type PhotoType = 'jpg' | 'png' | 'webp';

/**
 * The image type from the file's first bytes ("magic numbers"), or null.
 * The client's file name and Content-Type are ignored: they are easy to fake.
 * SVG is deliberately not accepted (it can carry scripts).
 */
export function detectPhotoType(bytes: Buffer): PhotoType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'png';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}
