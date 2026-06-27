import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStorage } from './storage/index.js';
import { syncMediaToStorage } from './sync.js';

describe('syncMediaToStorage', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('uploads media then skips already-present files on re-sync', async () => {
    const mediaDir = path.join(tmp, 'out');
    await fs.mkdir(path.join(mediaDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(mediaDir, 'thumbnails'), { recursive: true });
    await fs.writeFile(path.join(mediaDir, 'images', 'u1.jpg'), 'img');
    await fs.writeFile(path.join(mediaDir, 'thumbnails', 'thumb_u1.jpg'), 'thumb');

    const storage = await createStorage(`file://${path.join(tmp, 'bucket')}`);

    const first = await syncMediaToStorage(storage, mediaDir);
    expect(first).toEqual({ uploaded: 2, skipped: 0 });
    expect((await storage.get('images/u1.jpg')).toString()).toBe('img');

    // Add one more photo, re-sync → only the new file uploads.
    await fs.writeFile(path.join(mediaDir, 'images', 'u2.jpg'), 'img2');
    const second = await syncMediaToStorage(storage, mediaDir);
    expect(second).toEqual({ uploaded: 1, skipped: 2 });
  });
});
