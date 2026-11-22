/**
 * File signatures ("magic bytes") of the accepted image types (AUDIT S11). The declared mimetype comes
 * from the client and proves nothing; the first bytes of the file are checked before anything is
 * stored, so the API cannot be used to host arbitrary files under an image label.
 */
export const IMAGE_SIGNATURES = {
  'image/jpeg': [[0, [0xff, 0xd8, 0xff]]],
  'image/png': [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  // RIFF....WEBP: bytes 4-7 hold the chunk size.
  'image/webp': [
    [0, [0x52, 0x49, 0x46, 0x46]],
    [8, [0x57, 0x45, 0x42, 0x50]],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [number, readonly number[]]>>;

/** True when `data` starts with the signature of `mimeType`; false for any other type. */
export function matchesImageSignature(data: Uint8Array, mimeType: string): boolean {
  const parts = (
    IMAGE_SIGNATURES as Record<string, ReadonlyArray<readonly [number, readonly number[]]>>
  )[mimeType];
  if (!parts) return false;
  return parts.every(([offset, bytes]) =>
    bytes.every((byte, index) => data[offset + index] === byte),
  );
}
