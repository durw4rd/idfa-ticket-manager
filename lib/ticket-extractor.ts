import OpenAI from 'openai';
import { config, type LDContext, type Message } from '@launchdarkly/ai-server';
import { createOpenAIHandler } from '@launchdarkly/ai-openai-messages';
import { createClaudeMessagesHandler } from '@launchdarkly/ai-claude-messages';
import { getLdClient } from './launchdarkly';

// AgentControl config that holds the model, parameters, and prompt for ticket extraction.
// The variation served decides the provider (OpenAI or Anthropic) at runtime.
export const TICKET_EXTRACTION_CONFIG_KEY = 'ticket-extraction';

const handlers = [createOpenAIHandler(), createClaudeMessagesHandler()];

export interface ExtractedTicketData {
  act: string;
  location: string;
  date: string;
  start: string;
}

// Used as the system message of the LaunchDarkly config, and by the fallback below
export const TICKET_EXTRACTION_PROMPT = `You are reading one page of an IDFA (International Documentary Film Festival Amsterdam) ticket. Each page is exactly one ticket.

Return a JSON object with these fields:
- "act": the film or program title exactly as printed (e.g. "Cutting Through Rocks")
- "location": the cinema or venue, including the screen number if shown (e.g. "Kriterion 1")
- "date": the screening date as DD-MM-YYYY (e.g. "15-11-2025")
- "start": the start time as HH:MM AM/PM (e.g. "06:45 PM")

How to read the ticket:
- The fields are usually labeled "Act", "Location", "Date" and "Start". Tickets may also use Dutch labels such as "Voorstelling", "Locatie", "Datum" and "Aanvang".
- Dates on the ticket are day first. Convert written dates (e.g. "Sat 15 Nov 2025") to DD-MM-YYYY.
- Convert 24-hour times to the 12-hour clock: "18:45" becomes "06:45 PM", "00:15" becomes "12:15 AM".
- Copy the title as printed. Don't translate it or correct its spelling.
- If a field is missing or unreadable, use an empty string. Never guess.

Return only the JSON object, with no other text or markdown.`;

// JSON Schema for the response, also set as the output format of the LaunchDarkly config
export const TICKET_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    act: { type: 'string', description: 'Film or program title as printed' },
    location: { type: 'string', description: 'Cinema or venue, with screen number' },
    date: { type: 'string', description: 'Screening date as DD-MM-YYYY' },
    start: { type: 'string', description: 'Start time as HH:MM AM/PM' },
  },
  required: ['act', 'location', 'date', 'start'],
  additionalProperties: false,
};

function splitDataUrl(base64Image: string): { mediaType: string; data: string } {
  const match = base64Image.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { mediaType: match[1], data: match[2] };
  }
  return { mediaType: 'image/png', data: base64Image };
}

function parseExtractedTicket(content: unknown): ExtractedTicketData {
  let extractedData: ExtractedTicketData;

  if (content && typeof content === 'object') {
    // Structured output configured on the LaunchDarkly config returns a parsed object
    extractedData = content as ExtractedTicketData;
  } else {
    if (typeof content !== 'string' || !content) {
      throw new Error('No response from the model');
    }
    // Parse JSON response (remove markdown code blocks if present)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : content;
    extractedData = JSON.parse(jsonString) as ExtractedTicketData;
  }

  // Validate required fields
  if (!extractedData.act || !extractedData.location || !extractedData.date || !extractedData.start) {
    throw new Error('Missing required fields in extracted data');
  }

  return extractedData;
}

/**
 * Extract with the model and prompt served by LaunchDarkly AgentControl.
 * Throws when the config is disabled, missing, or LaunchDarkly is unreachable.
 */
async function extractWithAgentControl(base64Image: string, context: LDContext): Promise<unknown> {
  const { mediaType, data } = splitDataUrl(base64Image);
  const history: Message[] = [
    {
      role: 'user',
      content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data } }],
    },
  ];

  const result = await config({ key: TICKET_EXTRACTION_CONFIG_KEY, handler: handlers }).invoke(
    'Extract the ticket information from this ticket page.',
    context,
    {},
    history
  );
  return result.response;
}

/**
 * The original hardcoded OpenAI call, used when LaunchDarkly can't serve the config.
 */
async function extractWithFallback(base64Image: string): Promise<unknown> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: TICKET_EXTRACTION_PROMPT },
          {
            type: 'image_url',
            image_url: {
              url: base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ticket', schema: TICKET_EXTRACTION_SCHEMA, strict: true },
    },
    // GPT-5 models reject max_tokens; temperature 0 only works at the default reasoning effort (none)
    max_completion_tokens: 500,
    temperature: 0,
  });

  return response.choices[0]?.message?.content;
}

/**
 * Extract ticket data from a base64-encoded image
 * The image should be a PNG image of a single ticket page
 */
export async function extractTicketDataFromImage(
  base64Image: string,
  context: LDContext
): Promise<ExtractedTicketData> {
  let content: unknown;

  try {
    if (await getLdClient()) {
      try {
        content = await extractWithAgentControl(base64Image, context);
      } catch (error) {
        console.warn(`AgentControl config "${TICKET_EXTRACTION_CONFIG_KEY}" unavailable, using fallback model:`, error);
      }
    }

    if (content === undefined) {
      content = await extractWithFallback(base64Image);
    }

    return parseExtractedTicket(content);
  } catch (error) {
    console.error('Error extracting ticket data:', error);
    throw error instanceof Error ? error : new Error('Failed to extract ticket data');
  }
}
