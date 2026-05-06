export interface TerminalScreenshotStatusInput {
  hasDetectedActivity: boolean;
  isActiveTab: boolean;
  changed: boolean;
  now: number;
  effectiveChangedAt: number;
  acknowledgedTime: number;
  wasNeedsAttention: boolean;
  wasPossiblyDone: boolean;
  inactivityMs: number;
  longInactivityMs: number;
}

export interface TerminalScreenshotStatusState {
  hasAcknowledgedCurrentOutput: boolean;
  idleStartedAt: number;
  isNeedsAttention: boolean;
  isPossiblyDone: boolean;
  isLongInactive: boolean;
  shouldKeepAttentionUntilFocus: boolean;
  shouldKeepBrownUntilInput: boolean;
  nextNeedsAttention: boolean;
  nextPossiblyDone: boolean;
  nextLongInactive: boolean;
}

export function resolveTerminalScreenshotStatus(
  input: TerminalScreenshotStatusInput
): TerminalScreenshotStatusState {
  const hasAcknowledgedCurrentOutput =
    input.hasDetectedActivity && input.acknowledgedTime >= input.effectiveChangedAt;
  const idleStartedAt = hasAcknowledgedCurrentOutput
    ? Math.max(input.effectiveChangedAt, input.acknowledgedTime)
    : input.effectiveChangedAt;
  const isNeedsAttention =
    input.hasDetectedActivity &&
    !input.isActiveTab &&
    !input.changed &&
    !hasAcknowledgedCurrentOutput &&
    input.now - input.effectiveChangedAt >= input.inactivityMs;
  const isLongInactive =
    input.hasDetectedActivity &&
    !input.changed &&
    input.now - idleStartedAt >= input.longInactivityMs;
  const isPossiblyDone =
    input.hasDetectedActivity &&
    !input.changed &&
    !isNeedsAttention &&
    hasAcknowledgedCurrentOutput &&
    !isLongInactive &&
    input.now - idleStartedAt >= input.inactivityMs;
  const shouldKeepAttentionUntilFocus = !input.changed && input.wasNeedsAttention;
  const shouldKeepBrownUntilInput = !input.changed && input.wasPossiblyDone;
  const shouldRevertToGreen = input.changed && !shouldKeepAttentionUntilFocus;
  const nextNeedsAttention = shouldKeepAttentionUntilFocus
    ? true
    : shouldRevertToGreen
      ? false
      : shouldKeepBrownUntilInput
        ? false
        : (isNeedsAttention && !isLongInactive);
  const nextPossiblyDone = shouldKeepAttentionUntilFocus
    ? false
    : shouldRevertToGreen
      ? false
      : shouldKeepBrownUntilInput
        ? !isLongInactive
        : isPossiblyDone;
  const nextLongInactive = nextNeedsAttention ? false : isLongInactive;

  return {
    hasAcknowledgedCurrentOutput,
    idleStartedAt,
    isNeedsAttention,
    isPossiblyDone,
    isLongInactive,
    shouldKeepAttentionUntilFocus,
    shouldKeepBrownUntilInput,
    nextNeedsAttention,
    nextPossiblyDone,
    nextLongInactive,
  };
}
