import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Attempts to find the IDFA festival page URL for a movie title using AI
 * Uses OpenAI's knowledge and reasoning to find the correct festival URL
 * Falls back to null if no link can be determined
 */
export async function findFestivalLink(movieTitle: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, cannot find festival link');
    return null;
  }

  try {
    const prompt = `Find the exact IDFA (International Documentary Film Festival Amsterdam) festival page URL for this title: "${movieTitle}"

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

If you know the exact URL for "${movieTitle}", respond with ONLY the full URL (including the trailing slash).
If you cannot find the URL or are uncertain, respond with exactly: null

Return format: Either the full URL or "null" (nothing else).`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 300,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content || content.toLowerCase() === 'null') {
      return null;
    }

    // Extract URL from response (handle various formats)
    let url = content.trim();
    
    // Remove any markdown formatting
    url = url.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    url = url.trim();
    
    // Check if it's a valid IDFA festival URL (film or composition)
    if (url.startsWith('http') && 
        (url.includes('festival.idfa.nl/en/film/') || url.includes('festival.idfa.nl/en/composition/'))) {
      // Ensure it ends with a slash
      return url.endsWith('/') ? url : `${url}/`;
    }

    return null;
  } catch (error) {
    console.error('Error finding festival link with AI:', error);
    return null;
  }
}

/**
 * Searches the IDFA website for a movie title and attempts to find the URL
 * This is a fallback method that tries to construct the URL pattern
 */
export async function searchFestivalWebsite(movieTitle: string): Promise<string | null> {
  // Convert title to slug format
  const slug = movieTitle
    .toLowerCase()
    .trim()
    .replace(/[^\w\s+-]/g, '') // Remove special chars except + and -
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // We can't actually fetch and parse the website in serverless without additional setup
  // So we'll return null and let the AI/hardcoded mapping handle it
  return null;
}

