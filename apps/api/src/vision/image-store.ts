import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ALLOWED_IMAGE_TYPES } from './vision-config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_TO_TYPE = Object.fromEntries(Object.entries(ALLOWED_IMAGE_TYPES).map(([t, e]) => [e, t]));

/** Stores uploaded frames on local disk, named only by a validated UUID (no client-supplied paths). */
export class ImageStore {
  constructor(private readonly dir: string) {}

  async save(messageId: string, mimeType: string, data: Buffer): Promise<void> {
    const ext = ALLOWED_IMAGE_TYPES[mimeType];
    if (!ext || !UUID.test(messageId)) throw new Error('Unsupported image type or id.');
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${messageId}.${ext}`), data, { flag: 'wx' });
  }

  async read(messageId: string): Promise<{ data: Buffer; mimeType: string } | null> {
    if (!UUID.test(messageId)) return null;
    for (const [ext, mimeType] of Object.entries(EXT_TO_TYPE)) {
      try {
        return { data: await readFile(join(this.dir, `${messageId}.${ext}`)), mimeType };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return null;
  }
}
