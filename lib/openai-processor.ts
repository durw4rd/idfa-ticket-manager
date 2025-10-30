import OpenAI from 'openai';
import { pdfPageToImage } from './pdf-utils';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractedTicketData {
  act: string;
  location: string;
  date: string;
  start: string;
  qrCodePosition?: {
    description: string;
  };
}

export async function extractTicketDataFromPDFPage(
  pdfBuffer: Buffer,
  pageNumber: number = 0
): Promise<ExtractedTicketData> {
  // Convert PDF page to image
  const imageBuffer = await pdfPageToImage(pdfBuffer, pageNumber);
  
  // Convert buffer to base64 for OpenAI
  const base64Image = imageBuffer.toString('base64');

  const prompt = `You are analyzing an IDFA (International Documentary Film Festival Amsterdam) ticket PDF. 
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

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response (remove markdown code blocks if present)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : content;
    const extractedData = JSON.parse(jsonString) as ExtractedTicketData;

    // Validate required fields
    if (!extractedData.act || !extractedData.location || !extractedData.date || !extractedData.start) {
      throw new Error('Missing required fields in extracted data');
    }

    return extractedData;
  } catch (error) {
    console.error('Error extracting ticket data:', error);
    throw new Error(`Failed to extract ticket data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

