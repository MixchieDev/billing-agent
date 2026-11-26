/**
 * The Get started gate. A new user sees nothing but the course until they
 * finish it; admins are never gated, so the person who sets users up cannot
 * lock themselves out. Existing users were backfilled as complete by
 * migration 007.
 */
export interface OnboardingState {
  role: string;
  onboardingWalkthroughAt: Date | null;
  onboardingCompletedAt: Date | null;
}

export function needsOnboarding(u: OnboardingState): boolean {
  if (u.role === 'ADMIN') return false;
  return u.onboardingCompletedAt === null;
}

/** Finishing needs the walkthrough done; the handbook acknowledgement is the user's word. */
export function canFinish(u: OnboardingState, acknowledgedHandbook: boolean): { ok: true } | { ok: false; reason: string } {
  if (u.onboardingCompletedAt) return { ok: false, reason: 'Onboarding is already complete' };
  if (!u.onboardingWalkthroughAt) return { ok: false, reason: 'Finish the walkthrough first — all eight steps' };
  if (!acknowledgedHandbook) return { ok: false, reason: 'Confirm you have read the handbook' };
  return { ok: true };
}
