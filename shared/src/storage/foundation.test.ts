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
import {
  decodeEmbedding,
  encodeEmbedding,
  parseSidecar,
  type Sidecar,
  serializeSidecar,
} from '../sidecar.js';
import { createStorage, KEYS } from './index.js';

describe('LocalStorage round-trip', () => {
  let root: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
  });
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('put/get/exists/list/delete under nested prefixes', async () => {
    const store = await createStorage(`file://${root}`);
    await store.put(KEYS.sidecar('abc123'), Buffer.from('{"hi":1}'));
    await store.put(KEYS.labels(), Buffer.from('{}'));

    expect(await store.exists(KEYS.sidecar('abc123'))).toBe(true);
    expect(await store.exists(KEYS.sidecar('missing'))).toBe(false);
    expect((await store.get(KEYS.sidecar('abc123'))).toString()).toBe('{"hi":1}');

    const keys = await store.list('sidecars');
    expect(keys).toEqual(['sidecars/abc123.json']);

    await store.delete(KEYS.sidecar('abc123'));
    expect(await store.exists(KEYS.sidecar('abc123'))).toBe(false);
  });
});

describe('sidecar encode/decode', () => {
  it('round-trips embeddings as base64 Float32 buffers', () => {
    const vec = new Float32Array([0.1, -0.2, 0.3]);
    const b64 = encodeEmbedding(Buffer.from(vec.buffer));
    const back = decodeEmbedding(b64);
    expect(new Float32Array(back!.buffer, back!.byteOffset, 3)).toEqual(vec);
    expect(encodeEmbedding(null)).toBeNull();
    expect(decodeEmbedding(null)).toBeNull();
  });

  it('serialize/parse validates shape', () => {
    const sidecar: Sidecar = {
      version: 1,
      contentHash: 'hash1',
      uuid: 'uuid1',
      tags: 'beach, sunset',
      tagsEmbedding: encodeEmbedding(Buffer.from(new Float32Array([1, 2]).buffer)),
      faces: [
        { bboxX: 0.1, bboxY: 0.1, bboxW: 0.2, bboxH: 0.2, detScore: 0.99, embedding: 'AAA=' },
      ],
      dogs: [],
    };
    expect(parseSidecar(serializeSidecar(sidecar))).toEqual(sidecar);
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
