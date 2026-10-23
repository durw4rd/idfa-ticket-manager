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
  qrCodePosition?: {
    description: string;
  };
}

// Used as the system message of the LaunchDarkly config, and by the fallback below
export const TICKET_EXTRACTION_PROMPT = `You are analyzing an IDFA (International Documentary Film Festival Amsterdam) ticket PDF.
Extract the following information and return it as JSON:

{
  "act": "The exact movie/film title as shown (e.g., 'Cutting Through Rocks')",
  "location": "The cinema or venue name (e.g., 'Kriterion 1')",
  "date": "The date in DD-MM-YYYY format (e.g., '15-11-2025')",
  "start": "The start time in HH:MM AM/PM format (e.g., '06:45 PM')",
  "qrCodePosition": {
    "description": "Describe the approximate position of the QR code on the page (e.g., 'top left, large square below the IDFA logo')"
  }
}

Important notes:
- Look for fields labeled "Act", "Location", "Date", and "Start"
- The date format is DD-MM-YYYY (day-month-year)
- The time format uses 12-hour clock with AM/PM
- Each PAGE represents exactly ONE ticket (you are analyzing a single page)
- Find the QR code (usually a large square code) and describe its position

Return ONLY valid JSON, no additional text or markdown formatting.`;

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
    model: 'gpt-4o',
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
    max_tokens: 500,
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
