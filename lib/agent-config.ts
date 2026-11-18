// Calling a LaunchDarkly AI config, shared by every AI feature (ticket extraction, festival link,
// film place, voting email). The config is the source of each feature's prompt, model and
// parameters, and its off switch. Each feature keeps its prompt constant and a hardcoded OpenAI
// fallback only for when LaunchDarkly can't be reached (this returns null).

import { config, type LDContext, type Message } from '@launchdarkly/ai-server';
import { createOpenAIMessagesHandler } from '@launchdarkly/ai-openai-messages';
import { createClaudeMessagesHandler } from '@launchdarkly/ai-claude-messages';
import { getLdClient } from './launchdarkly';

// Created on first use: the OpenAI handler throws when OPENAI_API_KEY isn't set, which would
// otherwise break importing these modules even for callers that never reach a model
let handlers: ReturnType<typeof createHandlers> | undefined;
function createHandlers() {
  return [createOpenAIMessagesHandler(), createClaudeMessagesHandler()];
}
function getHandlers() {
  return (handlers ??= createHandlers());
}

/**
 * What calling an AI config gave: the model's response, or `disabled` when LaunchDarkly
 * deliberately serves the config's disabled variation (targeting off, or a rule serving it). The
 * config is the feature's off switch: on `disabled` the caller makes no AI call at all, fallback
 * included.
 */
export type AgentConfigResult = { disabled: false; response: unknown } | { disabled: true };

// What config().invoke() evaluates with when LaunchDarkly has no value: an AI config that is off
const DISABLED_DEFAULT = { enabled: false };

/**
 * Call the AI config `key` with the model and prompt it serves (the variation picks the provider).
 * Returns `{ disabled: true }` when the config is deliberately disabled, and null when LaunchDarkly
 * can't answer (no SDK key, not initialised, config not found, evaluation or network error, or the
 * provider call failing), in which case the caller uses its OpenAI fallback. A response the caller
 * can't use is the caller's to judge.
 *
 * invoke() throws "Variation … is not enabled" both for a disabled config and an unknown one, so
 * the evaluation reason tells them apart first: kind ERROR (FLAG_NOT_FOUND, CLIENT_NOT_READY, …) is
 * unavailable; a served value whose _ldMeta.enabled is false is disabled.
 */
export async function invokeAgentConfig(
  key: string,
  context: LDContext,
  { input, variables = {}, history }: { input?: string; variables?: Record<string, unknown>; history?: Message[] } = {}
): Promise<AgentConfigResult | null> {
  const client = await getLdClient();
  if (!client) {
    return null;
  }

  let enabled: boolean;
  try {
    const detail = await client.variationDetail(key, context, DISABLED_DEFAULT);
    if (detail.reason.kind === 'ERROR') {
      console.warn(`AgentControl config "${key}" unavailable (${detail.reason.errorKind ?? 'error'}), using fallback model`);
      return null;
    }
    const value = detail.value as { _ldMeta?: { enabled?: unknown } } | null;
    enabled = value?._ldMeta?.enabled === true;
  } catch (error) {
    console.warn(`AgentControl config "${key}" unavailable, using fallback model:`, error);
    return null;
  }
  if (!enabled) {
    return { disabled: true };
  }

  try {
    const result = await config({ key, handler: getHandlers() }).invoke(input, context, variables, history);
    return { disabled: false, response: result.response };
  } catch (error) {
    console.warn(`AgentControl config "${key}" unavailable, using fallback model:`, error);
    return null;
  }
}
