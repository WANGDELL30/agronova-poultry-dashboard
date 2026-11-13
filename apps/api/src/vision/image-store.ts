import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ALLOWED_IMAGE_TYPES } from './vision-config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_TO_TYPE = Object.fromEntries(Object.entries(ALLOWED_IMAGE_TYPES).map(([t, e]) => [e, t]));

/** The frame could not be written to disk (full, read-only, removed folder). Maps to 503 (H9). */
export class StorageUnavailableError extends Error {}

type Writer = (path: string, data: Buffer, options: { flag: string }) => Promise<void>;

/** Stores uploaded frames on local disk, named only by a validated UUID (no client-supplied paths). */
export class ImageStore {
  constructor(
    private readonly dir: string,
    /** Injectable for tests that simulate a disk failure mid-write. */
    private readonly write: Writer = writeFile,
  ) {}

  /** Startup check (AUDIT H9): the folder exists or can be created, and is writable. */
  async ensureWritable(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await access(this.dir, constants.W_OK);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
      throw new Error(`VISION_IMAGE_DIR "${this.dir}" is not a writable directory (${code}).`, {
        cause: error,
      });
    }
  }

  async save(messageId: string, mimeType: string, data: Buffer): Promise<void> {
    const ext = ALLOWED_IMAGE_TYPES[mimeType];
    if (!ext || !UUID.test(messageId)) throw new Error('Unsupported image type or id.');
    const path = join(this.dir, `${messageId}.${ext}`);
    try {
      await mkdir(this.dir, { recursive: true });
      await this.write(path, data, { flag: 'wx' });
    } catch (error) {
      // Never leave a half-written frame behind (H9). The id is a fresh UUID, so the file is ours.
      await rm(path, { force: true }).catch(() => undefined);
      throw new StorageUnavailableError(
        `Image storage failed: ${(error as NodeJS.ErrnoException).code ?? 'unknown'}`,
        { cause: error },
      );
    }
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
