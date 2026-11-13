import { describe, expect, it } from 'vitest';

import { evaluateVote, type VotedLabel } from './voter.js';

const r = (label: 'stress' | 'not_stress' | 'undefined', confidence: number | null) => ({
  label,
  confidence,
});

describe('evaluateVote (label-based voting, K1/V1)', () => {
  it('ignores frames without a classification', () => {
    expect(evaluateVote({ result: null, window: [] }).vote.status).toBe('ignored_no_result');
  });

  it('ignores undefined labels without touching the window', () => {
    expect(evaluateVote({ result: r('undefined', null), window: [] })).toMatchObject({
      accepted: false,
      vote: { status: 'ignored_undefined', window_filled: 0 },
    });
  });

  it('counts stress frames with 3 or 4 YA as votes, whatever their confidence (K1, V1)', () => {
    expect(evaluateVote({ result: r('stress', 3 / 7), window: [] })).toMatchObject({
      accepted: true,
      vote: { status: 'waiting_window', window_filled: 1 },
    });
    expect(evaluateVote({ result: r('stress', 4 / 7), window: [] }).accepted).toBe(true);
  });

  it('alerts on stress(3), stress(4), not_stress(1), stress(3), not_stress(0) (K1, V1)', () => {
    const sequence = [
      r('stress', 3 / 7),
      r('stress', 4 / 7),
      r('not_stress', 6 / 7),
      r('stress', 3 / 7),
      r('not_stress', 1),
    ];
    const window: VotedLabel[] = [];
    let last;
    for (const result of sequence) {
      last = evaluateVote({ result, window });
      if (last.accepted && result.label !== 'undefined') window.push(result.label);
    }
    expect(last?.vote).toMatchObject({
      status: 'alert',
      trigger_alert: true,
      window_filled: 5,
      majority_label: 'stress',
      majority_count: 3,
    });
  });

  it('keeps the window unchanged for undefined and non-result frames', () => {
    const window: VotedLabel[] = ['stress', 'stress', 'stress', 'stress'];
    for (const result of [null, r('undefined', null)]) {
      expect(evaluateVote({ result, window })).toMatchObject({
        accepted: false,
        vote: { window_filled: 4, trigger_alert: false },
      });
    }
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
