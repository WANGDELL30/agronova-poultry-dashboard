import type { VisionResultV1 } from '@agronova/vision-schema';

import type { VotedLabel } from './voter.js';

export const VISION_REPOSITORY = Symbol('VISION_REPOSITORY');

export interface VisionRepository {
  insert(record: VisionResultV1): Promise<void>;
  findById(messageId: string): Promise<VisionResultV1 | null>;
  /** Newest first, by received_at. */
  list(cameraId: string | undefined, limit: number): Promise<VisionResultV1[]>;
  /** Labels of frames that were accepted by the voter, oldest first (arrival order). */
  acceptedLabels(cameraId: string, limit: number): Promise<VotedLabel[]>;
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
      .slice()
      .reverse()
      .slice(0, limit);
  }

  async acceptedLabels(cameraId: string, limit: number): Promise<VotedLabel[]> {
    const labels: VotedLabel[] = [];
    for (const r of this.records) {
      if (r.camera_id !== cameraId || r.result === null) continue;
      const { label, confidence } = r.result;
      if (
        label !== 'undefined' &&
        confidence !== null &&
        r.vote.status !== 'ignored_low_confidence'
      ) {
        labels.push(label);
      }
    }
    return labels.slice(-limit);
  }
}
