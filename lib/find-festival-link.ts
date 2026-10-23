import OpenAI from 'openai';
import { config, type LDContext } from '@launchdarkly/ai-server';
import { createOpenAIHandler } from '@launchdarkly/ai-openai-messages';
import { createClaudeMessagesHandler } from '@launchdarkly/ai-claude-messages';
import { evaluateBooleanFlag, getLdClient } from './launchdarkly';

// AgentControl config with the prompt for finding a film's IDFA page.
// Its messages use the {{movieTitle}} and {{festivalYear}} variables.
export const FESTIVAL_LINK_CONFIG_KEY = 'festival-link-finder';
// Kill switch for the AI lookup
export const FESTIVAL_LINK_FLAG_KEY = 'festival-link-ai';

const handlers = [createOpenAIHandler(), createClaudeMessagesHandler()];

// Used as the LaunchDarkly config's user message, and by the fallback below
export const FESTIVAL_LINK_PROMPT = `Find the exact IDFA (International Documentary Film Festival Amsterdam) festival page URL for this title: "{{movieTitle}}", shown at IDFA {{festivalYear}}.

The IDFA festival website uses different URL patterns:
1. For individual films: https://festival.idfa.nl/en/film/{uuid}/{film-slug}/
2. For shorts/composition programs: https://festival.idfa.nl/en/composition/{uuid}/{program-slug}/

Known examples for individual films:
- "2000 Meters to Andriivka" → https://festival.idfa.nl/en/film/74a12e6d-5bfc-4f9a-8b46-3f00897ead76/2000-Meters-to-Andriivka/
- "32 Meters" → https://festival.idfa.nl/en/film/4e98a274-4110-4b21-a09f-732759e6ee9f/32-Meters/
- "Cutting Through Rocks" → https://festival.idfa.nl/en/film/4763160d-d001-4909-88db-4e138073ee9e/cutting-through-rocks/
- "Kabul Between Prayers" → https://festival.idfa.nl/en/film/8b7b601e-1118-4497-a9bc-f9cf7ae4ea2c/kabul-between-prayers/
- "Do You Love Me" → https://festival.idfa.nl/en/film/826b8dd8-fad9-4e1f-ba9f-77bef98867f2/do-you-love-me/
- "Love+War" → https://festival.idfa.nl/en/film/70c56a94-2f14-406a-b220-49c0bb35e867/love+war/
- "We Want the Funk!" → https://festival.idfa.nl/en/film/ae99be0e-f87c-46f9-ae0f-eb5a469f2256/we-want-the-funk!/
- "Coexistence, My Ass!" → https://festival.idfa.nl/en/film/fa4c3909-7b7f-458f-a5ec-31b0eb160dab/coexistence-my-ass!/

Known examples for shorts/composition programs:
- "Shorts: Inhospitable Landscapes" → https://festival.idfa.nl/en/composition/83822564-582e-4e4f-9baf-3723c9e50711/shorts%3A-inhospitable-landscapes/
- Titles starting with "Shorts:" are typically composition programs

Important:
- If the title starts with "Shorts:", "Shorts ", or includes ":" and appears to be a program/compilation, use the /en/composition/ URL pattern
- For regular film titles, use the /en/film/ URL pattern
- The slug may use URL encoding (e.g., %3A for colon)
- Always include the trailing slash

If you know the exact URL for "{{movieTitle}}", respond with ONLY the full URL (including the trailing slash).
If you cannot find the URL or are uncertain, respond with exactly: null

Return format: Either the full URL or "null" (nothing else).`;

function fillPrompt(movieTitle: string, festivalYear: number): string {
  return FESTIVAL_LINK_PROMPT.replaceAll('{{movieTitle}}', movieTitle).replaceAll(
    '{{festivalYear}}',
    String(festivalYear)
  );
}

async function findWithAgentControl(movieTitle: string, festivalYear: number, context: LDContext): Promise<string> {
  const result = await config({ key: FESTIVAL_LINK_CONFIG_KEY, handler: handlers }).invoke(undefined, context, {
    movieTitle,
    festivalYear,
  });
  return String(result.response ?? '');
}

async function findWithFallback(movieTitle: string, festivalYear: number): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: fillPrompt(movieTitle, festivalYear),
      },
    ],
    max_tokens: 300,
    temperature: 0,
  });

  return response.choices[0]?.message?.content ?? '';
}

const FESTIVAL_HOST = 'festival.idfa.nl';
// Archived festival pages redirect from festival.idfa.nl to www.idfa.nl
const ALLOWED_REDIRECT_HOSTS = new Set([FESTIVAL_HOST, 'www.idfa.nl']);
const MAX_REDIRECTS = 3;

function parseFestivalUrl(content: string): string | null {
  // Extract URL from response (handle various formats)
  let url = content.trim();
  if (!url || url.toLowerCase() === 'null') {
    return null;
  }

  // Remove any markdown formatting
  url = url.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  url = url.trim();

  // Only accept an https film or composition page on the IDFA festival site
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== FESTIVAL_HOST ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    !/^\/en\/(film|composition)\/[^/]+\/[^/]+\/?$/.test(parsed.pathname)
  ) {
    return null;
  }

  // Ensure it ends with a slash
  const normalized = `${parsed.origin}${parsed.pathname}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

/**
 * Check that a festival URL leads to a real film page. The IDFA site answers 200 for
 * made-up film URLs and serves a generic page, so look at the page title as well.
 * Only IDFA hosts are ever requested: redirects are followed by hand and must stay on them.
 */
export async function verifyFestivalLink(url: string): Promise<boolean> {
  try {
    let current = new URL(url);
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== 'https:' || !ALLOWED_REDIRECT_HOSTS.has(current.hostname) || current.port !== '') {
        return false;
      }
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return false;
    }
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
    return title.length > 0 && !/^IDFA (Festival|Institute)\b/i.test(title);
  } catch (error) {
    console.warn(`Could not verify festival link ${url}:`, error);
    return false;
  }
}

/**
 * Attempts to find the IDFA festival page URL for a movie title using AI.
 * The model comes from the LaunchDarkly AgentControl config, with a hardcoded
 * OpenAI fallback. Only links that resolve to a real film page are returned.
 */
export async function findFestivalLink(
  movieTitle: string,
  festivalYear: number,
  context: LDContext
): Promise<string | null> {
  const enabled = await evaluateBooleanFlag(FESTIVAL_LINK_FLAG_KEY, context, true);
  if (!enabled.value) {
    return null;
  }

  try {
    let content: string | undefined;

    if (await getLdClient()) {
      try {
        content = await findWithAgentControl(movieTitle, festivalYear, context);
      } catch (error) {
        console.warn(`AgentControl config "${FESTIVAL_LINK_CONFIG_KEY}" unavailable, using fallback model:`, error);
      }
    }

    if (content === undefined) {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OpenAI API key not configured, cannot find festival link');
        return null;
      }
      content = await findWithFallback(movieTitle, festivalYear);
    }

    const url = parseFestivalUrl(content);
    if (url && (await verifyFestivalLink(url))) {
      return url;
    }
    return null;
  } catch (error) {
    console.error('Error finding festival link with AI:', error);
    return null;
  }
}
