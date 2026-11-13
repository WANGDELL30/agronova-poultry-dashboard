import {
  VOTE_MIN_VOTES_FOR_ALERT,
  VOTE_WINDOW_SIZE,
  type ClassificationResult,
  type Vote,
} from './index.js';

/** A frame that entered the voting window: a classified frame labelled stress or not_stress. */
export type VotedLabel = 'stress' | 'not_stress';

export interface VoteInput {
  /** Null when the frame has no classification (skipped_quality / parse_error / inference_error). */
  result: Pick<ClassificationResult, 'label'> | null;
  /** Labels of previously accepted frames for the same camera, oldest first. */
  window: readonly VotedLabel[];
}

/**
 * Label-based temporal vote, shared by the API and the web mock client (AUDIT K6). Stateless: the window is rebuilt from stored records so it
 * survives API restarts. Every classified frame labelled `stress` or `not_stress` is a vote, with no
 * confidence filter (window 5, alert when the majority is `stress` with at least 3 votes). This is a
 * deliberate deviation from the voter in inference notebook 04, which also required confidence >= 0.6
 * (decision 2026-11-13, AUDIT K1/V1): confidence there is YA/7, so stress frames with 3-4 YA never
 * became votes. `undefined` is `ignored_undefined`; frames without a classification are
 * `ignored_no_result` instead of the notebook's parse_error -> `undefined` conflation.
 */
export function evaluateVote({ result, window }: VoteInput): { vote: Vote; accepted: boolean } {
  const empty = (status: Vote['status'], filled: number): Vote => ({
    status,
    trigger_alert: false,
    window_size: VOTE_WINDOW_SIZE,
    window_filled: filled,
    majority_label: null,
    majority_count: null,
  });
  const prior = window.slice(-VOTE_WINDOW_SIZE);

  if (result === null) return { vote: empty('ignored_no_result', prior.length), accepted: false };
  if (result.label === 'undefined') {
    return { vote: empty('ignored_undefined', prior.length), accepted: false };
  }
  const current = [...prior, result.label].slice(-VOTE_WINDOW_SIZE);
  if (current.length < VOTE_WINDOW_SIZE) {
    return { vote: empty('waiting_window', current.length), accepted: true };
  }

  const stress = current.filter((label) => label === 'stress').length;
  const notStress = current.length - stress;
  // A window of 5 with two labels has no ties.
  const majority: VotedLabel = stress > notStress ? 'stress' : 'not_stress';
  const count = majority === 'stress' ? stress : notStress;
  const alert = majority === 'stress' && count >= VOTE_MIN_VOTES_FOR_ALERT;

  return {
    vote: {
      status: alert ? 'alert' : 'no_alert',
      trigger_alert: alert,
      window_size: VOTE_WINDOW_SIZE,
      window_filled: current.length,
      majority_label: majority,
      majority_count: count,
    },
    accepted: true,
  };
}
