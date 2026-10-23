import { init, type LDClient } from '@launchdarkly/node-server-sdk';
import { initClient, type LDClientInterface, type LDContext } from '@launchdarkly/ai-server';

// One LaunchDarkly client per server instance, shared by feature flags and AgentControl configs.
// Kept on globalThis so Next.js dev-mode hot reloads don't open a new streaming connection each time.
const globalForLd = globalThis as unknown as { ldClientPromise?: Promise<LDClient | null> };

async function createClient(): Promise<LDClient | null> {
  // The current AI SDK reads LD_SDK_KEY; LAUNCHDARKLY_SDK_KEY is accepted as an alias
  const sdkKey = process.env.LD_SDK_KEY || process.env.LAUNCHDARKLY_SDK_KEY;
  if (!sdkKey) {
    console.warn('LD_SDK_KEY is not set; LaunchDarkly flags and AI configs will use code fallbacks');
    return null;
  }

  const client = init(sdkKey);
  try {
    await client.waitForInitialization({ timeout: 5 });
  } catch (error) {
    console.warn('LaunchDarkly did not initialize in time; using fallbacks until it connects:', error);
  }

  try {
    // The Node SDK's close() returns void where the AI SDK expects a Promise; it only awaits it
    await initClient(client as unknown as LDClientInterface, {
      sdkKey,
      serviceName: process.env.LD_SERVICE_NAME || 'idfa-manager',
    });
  } catch (error) {
    console.error('Failed to initialize the LaunchDarkly AI SDK:', error);
  }

  return client;
}

/**
 * Returns the shared LaunchDarkly client, or null when no SDK key is configured.
 */
export function getLdClient(): Promise<LDClient | null> {
  if (!globalForLd.ldClientPromise) {
    globalForLd.ldClientPromise = createClient();
  }
  return globalForLd.ldClientPromise;
}

export function userContext(email: string): LDContext {
  return { kind: 'user', key: email, email };
}

/**
 * Evaluate a boolean flag. `available` is false when LaunchDarkly can't answer
 * (no SDK key, not initialized, or the flag doesn't exist), so callers can tell
 * "flag is off" apart from "LaunchDarkly is down" and pick their own fallback.
 */
export async function evaluateBooleanFlag(
  flagKey: string,
  context: LDContext,
  defaultValue: boolean
): Promise<{ value: boolean; available: boolean }> {
  const client = await getLdClient();
  if (!client) {
    return { value: defaultValue, available: false };
  }

  try {
    const detail = await client.variationDetail(flagKey, context, defaultValue);
    const available = detail.reason.kind !== 'ERROR';
    return { value: available ? Boolean(detail.value) : defaultValue, available };
  } catch (error) {
    console.warn(`Failed to evaluate flag ${flagKey}:`, error);
    return { value: defaultValue, available: false };
  }
}

/**
 * Send a custom metric event (used for AI quality metrics such as extraction corrections).
 */
export async function trackEvent(
  eventKey: string,
  context: LDContext,
  data?: Record<string, unknown>,
  metricValue?: number
): Promise<void> {
  const client = await getLdClient();
  client?.track(eventKey, context, data, metricValue);
}

/**
 * Flush pending analytics events. Call from `after()` in route handlers so events
 * are delivered before the serverless instance is frozen.
 */
export async function flushLdEvents(): Promise<void> {
  const client = await getLdClient();
  try {
    await client?.flush();
  } catch (error) {
    console.warn('Failed to flush LaunchDarkly events:', error);
  }
}
