import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImageStore, StorageUnavailableError } from './image-store.js';
import { VisionModule } from './vision.module.js';

const id = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';

describe('ImageStore (H9)', () => {
  let dir: string;
  const previous = process.env.VISION_IMAGE_DIR;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'image-store-'));
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.VISION_IMAGE_DIR;
    else process.env.VISION_IMAGE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it('fails fast when VISION_IMAGE_DIR is a file', async () => {
    const file = join(dir, 'not-a-dir');
    await writeFile(file, 'x');
    await expect(new ImageStore(file).ensureWritable()).rejects.toThrow(/VISION_IMAGE_DIR/);
  });

  it('stops the API from starting when VISION_IMAGE_DIR is a file', async () => {
    const file = join(dir, 'not-a-dir');
    await writeFile(file, 'x');
    process.env.VISION_IMAGE_DIR = file;
    await expect(
      NestFactory.create(VisionModule, new FastifyAdapter(), {
        logger: false,
        abortOnError: false,
      }),
    ).rejects.toThrow(/VISION_IMAGE_DIR/);
  });

  it('removes a half-written file and reports storage as unavailable', async () => {
    const failingWrite = async (path: string) => {
      await writeFile(path, 'half');
      throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    };
    const store = new ImageStore(dir, failingWrite);
    await expect(store.save(id, 'image/png', Buffer.from('full'))).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
    expect(await readdir(dir)).toEqual([]);
  });
});
