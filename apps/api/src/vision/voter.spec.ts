import { describe, expect, it } from 'vitest';

import { evaluateVote, type VotedLabel } from './voter.js';

const r = (label: 'stress' | 'not_stress' | 'undefined', confidence: number | null) => ({
  label,
  confidence,
});

describe('evaluateVote (port of make_temporal_voter)', () => {
  it('ignores frames without a classification', () => {
    expect(evaluateVote({ result: null, window: [] }).vote.status).toBe('ignored_no_result');
  });

  it('ignores undefined labels and low confidence without touching the window', () => {
    expect(evaluateVote({ result: r('undefined', null), window: [] })).toMatchObject({
      accepted: false,
      vote: { status: 'ignored_undefined' },
    });
    expect(evaluateVote({ result: r('stress', 0.57), window: [] })).toMatchObject({
      accepted: false,
      vote: { status: 'ignored_low_confidence' },
    });
  });

  it('accepts confidence exactly at the 0.6 threshold', () => {
    expect(evaluateVote({ result: r('stress', 0.6), window: [] }).accepted).toBe(true);
  });

  it('waits until the window holds 5 accepted frames', () => {
    const window: VotedLabel[] = ['stress', 'stress', 'stress'];
    const { vote } = evaluateVote({ result: r('stress', 0.9), window });
    expect(vote).toMatchObject({
      status: 'waiting_window',
      window_filled: 4,
      trigger_alert: false,
    });
  });

  it('alerts when stress is the majority with >= 3 of 5', () => {
    const { vote } = evaluateVote({
      result: r('stress', 0.9),
      window: ['stress', 'stress', 'not_stress', 'not_stress'],
    });
    expect(vote).toMatchObject({
      status: 'alert',
      trigger_alert: true,
      majority_label: 'stress',
      majority_count: 3,
    });
  });

  it('does not alert when not_stress is the majority', () => {
    const { vote } = evaluateVote({
      result: r('not_stress', 0.9),
      window: ['stress', 'stress', 'not_stress', 'not_stress'],
    });
    expect(vote).toMatchObject({
      status: 'no_alert',
      trigger_alert: false,
      majority_label: 'not_stress',
      majority_count: 3,
    });
  });

  it('only looks at the most recent 5 frames', () => {
    const window: VotedLabel[] = [
      'stress',
      'stress',
      'stress',
      'not_stress',
      'not_stress',
      'not_stress',
      'not_stress',
    ];
    expect(evaluateVote({ result: r('not_stress', 0.9), window }).vote.majority_label).toBe(
      'not_stress',
    );
  });
});
