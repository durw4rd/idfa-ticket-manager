import { beforeEach, describe, expect, it, vi } from 'vitest';

const isKnownMember = vi.fn();
const evaluateBooleanFlag = vi.fn();
vi.mock('./groups', () => ({
  isKnownMember: (email: string) => isKnownMember(email),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));
vi.mock('./launchdarkly', () => ({
  evaluateBooleanFlag: (...args: unknown[]) => evaluateBooleanFlag(...args),
  userContext: (email: string) => ({ kind: 'user', key: email }),
}));

const { hasAccessEnded } = await import('./auth');

// Each test uses its own address: answers are remembered for a minute per email
let n = 0;
const someone = () => `person${++n}@example.com`;

describe('hasAccessEnded', () => {
  beforeEach(() => {
    isKnownMember.mockReset();
    evaluateBooleanFlag.mockReset();
  });

  it('keeps a group member in without asking LaunchDarkly', async () => {
    isKnownMember.mockResolvedValue(true);
    expect(await hasAccessEnded(someone())).toBe(false);
    expect(evaluateBooleanFlag).not.toHaveBeenCalled();
  });

  it('ends access for a non-member the app-access flag turns away', async () => {
    isKnownMember.mockResolvedValue(false);
    evaluateBooleanFlag.mockResolvedValue({ value: false, available: true });
    expect(await hasAccessEnded(someone())).toBe(true);
  });

  it('keeps a non-member the flag allows', async () => {
    isKnownMember.mockResolvedValue(false);
    evaluateBooleanFlag.mockResolvedValue({ value: true, available: true });
    expect(await hasAccessEnded(someone())).toBe(false);
  });

  it("keeps access when it can't be checked", async () => {
    isKnownMember.mockRejectedValue(new Error('db down'));
    expect(await hasAccessEnded(someone())).toBe(false);
    isKnownMember.mockResolvedValue(false);
    evaluateBooleanFlag.mockResolvedValue({ value: true, available: false });
    expect(await hasAccessEnded(someone())).toBe(false); // No fallback allowlist in tests
  });

  it('remembers the answer for a minute', async () => {
    const email = someone();
    isKnownMember.mockResolvedValue(true);
    await hasAccessEnded(email);
    isKnownMember.mockResolvedValue(false);
    evaluateBooleanFlag.mockResolvedValue({ value: false, available: true });
    expect(await hasAccessEnded(email)).toBe(false);
    expect(isKnownMember).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ now: Date.now() + 61_000 });
    try {
      expect(await hasAccessEnded(email)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
