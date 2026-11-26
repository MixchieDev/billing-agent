/**
 * The Get started gate: a new user sees only the course until they finish it;
 * admins are never gated, so the person creating users cannot lock themselves out.
 */
import { needsOnboarding, canFinish } from '@/lib/onboarding/gate';

const user = (over: Partial<Parameters<typeof needsOnboarding>[0]> = {}) => ({
  role: 'VIEWER',
  onboardingWalkthroughAt: null,
  onboardingCompletedAt: null,
  ...over,
});

describe('needsOnboarding', () => {
  it('gates a new viewer or approver', () => {
    expect(needsOnboarding(user())).toBe(true);
    expect(needsOnboarding(user({ role: 'APPROVER' }))).toBe(true);
  });

  it('never gates an admin, even one with no completion date', () => {
    expect(needsOnboarding(user({ role: 'ADMIN' }))).toBe(false);
  });

  it('opens the app once the course is complete', () => {
    expect(needsOnboarding(user({ onboardingCompletedAt: new Date() }))).toBe(false);
  });

  it('is not satisfied by the walkthrough alone', () => {
    expect(needsOnboarding(user({ onboardingWalkthroughAt: new Date() }))).toBe(true);
  });
});

describe('canFinish', () => {
  it('needs the walkthrough done and the handbook acknowledged', () => {
    expect(canFinish(user(), true).ok).toBe(false);
    expect(canFinish(user({ onboardingWalkthroughAt: new Date() }), false).ok).toBe(false);
    expect(canFinish(user({ onboardingWalkthroughAt: new Date() }), true).ok).toBe(true);
  });

  it('says why, in words a new hire understands', () => {
    const r = canFinish(user(), true);
    expect(r.ok === false && r.reason).toMatch(/walkthrough/i);
  });

  it('refuses to finish twice', () => {
    expect(canFinish(user({ onboardingWalkthroughAt: new Date(), onboardingCompletedAt: new Date() }), true).ok).toBe(false);
  });
});
