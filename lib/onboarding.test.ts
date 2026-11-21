import { describe, expect, it } from 'vitest';
import type { Group } from './types';
import { declineEndsAccess, onboardingSteps } from './onboarding';

const group = (id: string, status: Group['status']): Group => ({
  id,
  name: id,
  createdBy: 'a@example.com',
  role: 'member',
  status,
  invitedBy: status === 'invited' ? 'a@example.com' : null,
  members: [],
});

describe('onboardingSteps', () => {
  it('starts with the crew step for someone invited', () => {
    expect(onboardingSteps([group('g', 'invited')])).toEqual(['crew', 'profile', 'tour', 'tickets']);
  });

  it('offers the crew step to someone in no group, to start one', () => {
    expect(onboardingSteps([])).toEqual(['crew', 'profile', 'tour', 'tickets']);
  });

  it('skips the crew step for someone already in a group with nothing pending', () => {
    expect(onboardingSteps([group('g', 'active')])).toEqual(['profile', 'tour', 'tickets']);
  });

  it('keeps the crew step when a new invite is pending next to a group', () => {
    expect(onboardingSteps([group('g', 'active'), group('h', 'invited')])[0]).toBe('crew');
  });
});

describe('declineEndsAccess', () => {
  it('is true for the only invite of someone let in by invites alone', () => {
    expect(declineEndsAccess([group('g', 'invited')], 'g', false)).toBe(true);
  });

  it('is false when the app-access flag lets them in anyway', () => {
    expect(declineEndsAccess([group('g', 'invited')], 'g', true)).toBe(false);
  });

  it('is false while another invite or group keeps them in', () => {
    expect(declineEndsAccess([group('g', 'invited'), group('h', 'invited')], 'g', false)).toBe(false);
    expect(declineEndsAccess([group('g', 'invited'), group('h', 'active')], 'g', false)).toBe(false);
  });
});
