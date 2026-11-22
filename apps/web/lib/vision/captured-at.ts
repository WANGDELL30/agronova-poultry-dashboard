import { CAPTURED_AT_EARLIEST } from '@agronova/vision-schema';

/**
 * captured_at for an uploaded file: its modification time, unless that is missing, in the future, or
 * earlier than the API accepts (a file date of 1970 or a photo from before 2020, AUDIT R8). In those
 * cases the upload time is used, so the API does not reject the photo over its file date.
 */
export function capturedAtForFile(lastModified: number, now: number = Date.now()): string {
  const earliest = Date.parse(CAPTURED_AT_EARLIEST);
  const usable = Number.isFinite(lastModified) && lastModified >= earliest && lastModified <= now;
  return new Date(usable ? lastModified : now).toISOString();
}
