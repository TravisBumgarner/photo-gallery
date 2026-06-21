import { z } from 'zod';

/**
 * Durable human labels — the one irreplaceable bit of ingestion state. Cluster
 * IDs churn on re-clustering, so labels are pinned to *immutable detections*
 * (file content hash + bbox), not cluster IDs. After re-clustering, each label
 * reattaches to whichever cluster now holds the plurality of its anchors.
 *
 * Stored as a single `labels.json` in the storage backend, backed up with it.
 */
const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const anchorSchema = z.object({
  contentHash: z.string(),
  bbox: bboxSchema, // [x, y, w, h], normalized 0..1
});

const labelEntrySchema = z.object({
  label: z.string().nullable(), // person/dog name; null when only `ignored`
  ignored: z.boolean(),
  anchors: z.array(anchorSchema), // member detections pinning this label
});

export const labelsFileSchema = z.object({
  version: z.literal(1),
  people: z.array(labelEntrySchema),
  dogs: z.array(labelEntrySchema),
});

export type Anchor = z.infer<typeof anchorSchema>;
export type LabelEntry = z.infer<typeof labelEntrySchema>;
export type LabelsFile = z.infer<typeof labelsFileSchema>;

export function serializeLabels(labels: LabelsFile): Buffer {
  return Buffer.from(JSON.stringify(labelsFileSchema.parse(labels), null, 2));
}

export function parseLabels(data: Buffer | string): LabelsFile {
  return labelsFileSchema.parse(JSON.parse(data.toString()));
}

/** A current cluster and the detections it contains, for reattachment. */
export interface ClusterMembers {
  clusterId: number;
  members: Anchor[];
}

export interface Reassignment {
  clusterId: number;
  label: string | null;
  ignored: boolean;
}

/** Detections at the same content hash within this normalized center distance
 * are treated as the same detection (re-runs reproduce bboxes near-exactly). */
const BBOX_MATCH_EPSILON = 0.02;

function bboxCenterDistance(a: Anchor['bbox'], b: Anchor['bbox']): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const dx = ax + aw / 2 - (bx + bw / 2);
  const dy = ay + ah / 2 - (by + bh / 2);
  return Math.hypot(dx, dy);
}

/**
 * Reattach saved labels to current clusters by plurality of matched anchors.
 * Each cluster receives at most one label; if two entries contend for the same
 * cluster, the one with more matched anchors wins.
 */
export function reapplyLabels(
  entries: LabelEntry[],
  clusters: ClusterMembers[],
): Reassignment[] {
  // Index current detections by content hash for fast anchor matching.
  const byHash = new Map<string, { clusterId: number; bbox: Anchor['bbox'] }[]>();
  for (const cluster of clusters) {
    for (const m of cluster.members) {
      const list = byHash.get(m.contentHash) ?? [];
      list.push({ clusterId: cluster.clusterId, bbox: m.bbox });
      byHash.set(m.contentHash, list);
    }
  }

  // For each saved entry, tally which cluster its anchors land in.
  const claims: { clusterId: number; entry: LabelEntry; votes: number }[] = [];
  for (const entry of entries) {
    const votes = new Map<number, number>();
    for (const anchor of entry.anchors) {
      const candidates = byHash.get(anchor.contentHash);
      if (!candidates) continue;
      let best: { clusterId: number; dist: number } | null = null;
      for (const c of candidates) {
        const dist = bboxCenterDistance(anchor.bbox, c.bbox);
        if (dist <= BBOX_MATCH_EPSILON && (!best || dist < best.dist)) {
          best = { clusterId: c.clusterId, dist };
        }
      }
      if (best) votes.set(best.clusterId, (votes.get(best.clusterId) ?? 0) + 1);
    }
    let winner: { clusterId: number; votes: number } | null = null;
    for (const [clusterId, count] of votes) {
      if (!winner || count > winner.votes) winner = { clusterId, votes: count };
    }
    if (winner) claims.push({ clusterId: winner.clusterId, entry, votes: winner.votes });
  }

  // Resolve contention: highest-vote claim wins each cluster.
  const best = new Map<number, { entry: LabelEntry; votes: number }>();
  for (const claim of claims) {
    const cur = best.get(claim.clusterId);
    if (!cur || claim.votes > cur.votes) {
      best.set(claim.clusterId, { entry: claim.entry, votes: claim.votes });
    }
  }

  return [...best.entries()].map(([clusterId, { entry }]) => ({
    clusterId,
    label: entry.label,
    ignored: entry.ignored,
  }));
}
