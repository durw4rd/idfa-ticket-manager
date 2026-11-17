// Calling a LaunchDarkly AgentControl config, shared by the ticket extractor, the festival link
// finder and the voting-email reader. Each of those keeps its own prompt constant and hardcoded
// OpenAI fallback: LaunchDarkly is optional at runtime, so when this returns null they call OpenAI.

import { config, type LDContext, type Message } from '@launchdarkly/ai-server';
import { createOpenAIHandler } from '@launchdarkly/ai-openai-messages';
import { createClaudeMessagesHandler } from '@launchdarkly/ai-claude-messages';
import { getLdClient } from './launchdarkly';

// Created on first use: the OpenAI handler throws when OPENAI_API_KEY isn't set, which would
// otherwise break importing these modules even for callers that never reach a model
let handlers: ReturnType<typeof createHandlers> | undefined;
function createHandlers() {
  return [createOpenAIHandler(), createClaudeMessagesHandler()];
}
function getHandlers() {
  return (handlers ??= createHandlers());
}

/**
 * The response from the model and prompt served by the AgentControl config `key` (the variation
 * picks the provider), or null when LaunchDarkly isn't configured or the call fails, in which case
 * the caller uses its fallback. A response the caller can't use is the caller's to judge.
 */
export async function invokeAgentConfig(
  key: string,
  context: LDContext,
  { input, variables = {}, history }: { input?: string; variables?: Record<string, unknown>; history?: Message[] } = {}
): Promise<{ response: unknown } | null> {
  if (!(await getLdClient())) {
    return null;
  }
  try {
    const result = await config({ key, handler: getHandlers() }).invoke(input, context, variables, history);
    return { response: result.response };
  } catch (error) {
    console.warn(`AgentControl config "${key}" unavailable, using fallback model:`, error);
    return null;
  }
}
