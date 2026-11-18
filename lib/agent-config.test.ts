import { beforeEach, describe, expect, it, vi } from 'vitest';

// LaunchDarkly and the AI SDK are mocked: these tests are about telling a served config from a
// disabled one (no AI call at all) and from an unavailable one (the caller's fallback runs)
const ldClient = { variationDetail: vi.fn() };
const getLdClient = vi.fn();
vi.mock('./launchdarkly', () => ({ getLdClient: () => getLdClient() }));

const invoke = vi.fn();
const config = vi.fn(() => ({ invoke }));
vi.mock('@launchdarkly/ai-server', () => ({ config: (...args: unknown[]) => config(...(args as [])) }));
vi.mock('@launchdarkly/ai-openai-messages', () => ({ createOpenAIMessagesHandler: () => ({}) }));
vi.mock('@launchdarkly/ai-claude-messages', () => ({ createClaudeMessagesHandler: () => ({}) }));

const { invokeAgentConfig } = await import('./agent-config');

const CONTEXT = { kind: 'user', key: 'someone@example.com' };
const served = (enabled: boolean, kind = 'FALLTHROUGH') => ({
  value: { _ldMeta: { enabled, variationKey: enabled ? 'openai' : 'disabled' }, messages: [] },
  reason: { kind },
});

describe('invokeAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    getLdClient.mockResolvedValue(ldClient);
  });

  it('calls the model when the config is served and enabled', async () => {
    ldClient.variationDetail.mockResolvedValue(served(true));
    invoke.mockResolvedValue({ response: '{"place":"Kabul"}' });
    const result = await invokeAgentConfig('film-place-finder', CONTEXT, { variables: { title: 'X' } });
    expect(result).toEqual({ disabled: false, response: '{"place":"Kabul"}' });
    expect(config).toHaveBeenCalledWith(expect.objectContaining({ key: 'film-place-finder' }));
    expect(invoke).toHaveBeenCalledWith(undefined, CONTEXT, { title: 'X' }, undefined);
  });

  it('reports disabled, without calling a model, when the disabled variation is served', async () => {
    ldClient.variationDetail.mockResolvedValue(served(false));
    expect(await invokeAgentConfig('film-place-finder', CONTEXT)).toEqual({ disabled: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports disabled when targeting is off', async () => {
    ldClient.variationDetail.mockResolvedValue(served(false, 'OFF'));
    expect(await invokeAgentConfig('vote-link-extraction', CONTEXT)).toEqual({ disabled: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns null, so the fallback runs, when the config is not found', async () => {
    ldClient.variationDetail.mockResolvedValue({ value: { enabled: false }, reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
    expect(await invokeAgentConfig('missing-config', CONTEXT)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns null when the client is not ready or evaluation fails', async () => {
    ldClient.variationDetail.mockResolvedValueOnce({ value: { enabled: false }, reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' } });
    expect(await invokeAgentConfig('ticket-extraction', CONTEXT)).toBeNull();
    ldClient.variationDetail.mockRejectedValueOnce(new Error('network down'));
    expect(await invokeAgentConfig('ticket-extraction', CONTEXT)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('returns null when there is no LaunchDarkly client (no LD_SDK_KEY)', async () => {
    getLdClient.mockResolvedValue(null);
    expect(await invokeAgentConfig('ticket-extraction', CONTEXT)).toBeNull();
    expect(ldClient.variationDetail).not.toHaveBeenCalled();
  });

  it('returns null when the served model call itself fails', async () => {
    ldClient.variationDetail.mockResolvedValue(served(true));
    invoke.mockRejectedValue(new Error('provider outage'));
    expect(await invokeAgentConfig('festival-link-finder', CONTEXT)).toBeNull();
  });
});
