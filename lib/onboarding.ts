import type { Group } from './types';

/** The steps of the welcome flow (/welcome), in order */
export type OnboardingStep = 'crew' | 'profile' | 'tour' | 'tickets';

/**
 * Which steps someone sees, worked out once when the flow opens so the list doesn't change under
 * them as they go. The crew step is for joining an invite, or starting a group when they have none;
 * someone already in a group with nothing pending skips it.
 */
export function onboardingSteps(groups: Group[]): OnboardingStep[] {
  const hasInvites = groups.some((group) => group.status === 'invited');
  const inAGroup = groups.some((group) => group.status === 'active');
  return [...(hasInvites || !inAGroup ? (['crew'] as const) : []), 'profile', 'tour', 'tickets'];
}

/**
 * Whether declining this invite signs the user out: it is their last membership of any kind, and
 * nothing else (the app-access flag) lets them in. See hasAccessEnded in lib/auth.ts.
 */
export function declineEndsAccess(groups: Group[], groupId: string, allowedWithoutGroups: boolean): boolean {
  return !allowedWithoutGroups && groups.every((group) => group.id === groupId);
}
