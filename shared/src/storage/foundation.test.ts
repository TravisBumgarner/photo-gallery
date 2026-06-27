import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type LabelEntry,
  parseLabels,
  reapplyLabels,
  serializeLabels,
} from '../labels.js';
import { createStorage, KEYS } from './index.js';

describe('LocalStorage round-trip', () => {
  let root: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
  });
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('put/get/exists/list/copy/delete under nested prefixes', async () => {
    const store = await createStorage(`file://${root}`);
    await store.put('thumbnails/abc123.json', Buffer.from('{"hi":1}'));
    await store.put(KEYS.labels(), Buffer.from('{}'));

    expect(await store.exists('thumbnails/abc123.json')).toBe(true);
    expect(await store.exists('thumbnails/missing.json')).toBe(false);
    expect((await store.get('thumbnails/abc123.json')).toString()).toBe('{"hi":1}');

    const keys = await store.list('thumbnails');
    expect(keys).toEqual(['thumbnails/abc123.json']);

    // copy (used to archive the old DB on publish)
    await store.copy('thumbnails/abc123.json', 'db/backups/copy.json');
    expect((await store.get('db/backups/copy.json')).toString()).toBe('{"hi":1}');

    await store.delete('thumbnails/abc123.json');
    expect(await store.exists('thumbnails/abc123.json')).toBe(false);
  });
});

describe('reapplyLabels', () => {
  // "Alice" was labeled on a cluster whose members are two detections.
  const alice: LabelEntry = {
    label: 'Alice',
    ignored: false,
    anchors: [
      { contentHash: 'h1', bbox: [0.1, 0.1, 0.2, 0.2] },
      { contentHash: 'h2', bbox: [0.5, 0.5, 0.1, 0.1] },
    ],
  };

  it('reattaches a label to whichever new cluster holds its anchors', () => {
    const result = reapplyLabels(
      [alice],
      [
        {
          clusterId: 42, // re-clustered: new id, same detections
          members: [
            { contentHash: 'h1', bbox: [0.1, 0.1, 0.2, 0.2] },
            { contentHash: 'h2', bbox: [0.5, 0.5, 0.1, 0.1] },
          ],
        },
        { clusterId: 7, members: [{ contentHash: 'h9', bbox: [0, 0, 0.1, 0.1] }] },
      ],
    );
    expect(result).toEqual([{ clusterId: 42, label: 'Alice', ignored: false }]);
  });

  it('uses plurality when anchors split across clusters', () => {
    const result = reapplyLabels(
      [alice],
      [
        { clusterId: 1, members: [{ contentHash: 'h1', bbox: [0.1, 0.1, 0.2, 0.2] }] },
        { clusterId: 2, members: [{ contentHash: 'h2', bbox: [0.5, 0.5, 0.1, 0.1] }] },
      ],
    );
    // 1 vote each → first-seen winner is stable; just assert it landed somewhere real.
    expect([1, 2]).toContain(result[0].clusterId);
    expect(result[0].label).toBe('Alice');
  });

  it('ignores anchors whose bbox moved beyond epsilon', () => {
    const result = reapplyLabels(
      [{ label: 'Bob', ignored: false, anchors: [{ contentHash: 'h1', bbox: [0.1, 0.1, 0.2, 0.2] }] }],
      [{ clusterId: 5, members: [{ contentHash: 'h1', bbox: [0.8, 0.8, 0.2, 0.2] }] }],
    );
    expect(result).toEqual([]); // same hash but far-off bbox → no match
  });

  it('serialize/parse labels.json round-trips', () => {
    const file = { version: 1 as const, people: [alice], dogs: [] };
    expect(parseLabels(serializeLabels(file))).toEqual(file);
  });
});
