import type { VisionResultV1 } from '@agronova/vision-schema';

import type { VotedLabel } from './voter.js';

export const VISION_REPOSITORY = Symbol('VISION_REPOSITORY');

/** Position of a frame in arrival order: received_at, then message_id as a stable tie-break. */
export type ArrivalKey = Pick<VisionResultV1, 'received_at' | 'message_id'>;

/**
 * Ordering uses received_at (backend clock), not captured_at: camera clock sync (NTP, AUDIT R7) is
 * not confirmed, and inference finishes in any order, so insertion order is not arrival order (R14).
 * ISO-8601 UTC strings of the same format compare correctly as strings.
 */
export const compareArrival = (a: ArrivalKey, b: ArrivalKey): number =>
  a.received_at < b.received_at
    ? -1
    : a.received_at > b.received_at
      ? 1
      : a.message_id < b.message_id
        ? -1
        : a.message_id > b.message_id
          ? 1
          : 0;

export interface VisionRepository {
  insert(record: VisionResultV1): Promise<void>;
  findById(messageId: string): Promise<VisionResultV1 | null>;
  /** Newest first, by received_at. */
  list(cameraId: string | undefined, limit: number): Promise<VisionResultV1[]>;
  /**
   * Labels of frames that were accepted by the voter and arrived before `before`, oldest first
   * (arrival order). A frame received later never enters the window of an earlier one (R14).
   */
  acceptedLabels(cameraId: string, limit: number, before: ArrivalKey): Promise<VotedLabel[]>;
}

/**
 * Phase 2b slice 1: volatile store. Replaced by a PostgreSQL repository once the migration
 * (see infrastructure/migrations) is applied; the interface stays the same.
 */
export class InMemoryVisionRepository implements VisionRepository {
  private readonly records: VisionResultV1[] = [];

  async insert(record: VisionResultV1): Promise<void> {
    this.records.push(record);
  }

  async findById(messageId: string): Promise<VisionResultV1 | null> {
    return this.records.find((r) => r.message_id === messageId) ?? null;
  }

  async list(cameraId: string | undefined, limit: number): Promise<VisionResultV1[]> {
    return this.records
      .filter((r) => cameraId === undefined || r.camera_id === cameraId)
      .sort((a, b) => compareArrival(b, a))
      .slice(0, limit);
  }

  async acceptedLabels(cameraId: string, limit: number, before: ArrivalKey): Promise<VotedLabel[]> {
    const labels: VotedLabel[] = [];
    const earlier = this.records
      .filter((r) => r.camera_id === cameraId && compareArrival(r, before) < 0)
      .sort(compareArrival);
    for (const r of earlier) {
      if (r.result === null) continue;
      // Same rule as the voter (K1/V1): every stress/not_stress label is a vote, no confidence filter.
      const { label } = r.result;
      if (label !== 'undefined') labels.push(label);
    }
    return labels.slice(-limit);
  }
}
