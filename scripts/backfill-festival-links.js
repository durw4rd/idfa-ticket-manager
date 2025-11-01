/**
 * Script to backfill festival links for existing tickets
 * Run with: npm run backfill-festival-links
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const { sql: vercelSql } = require('@vercel/postgres');
const OpenAI = require('openai').default || require('openai');

// Set DATABASE_URL or POSTGRES_URL before importing
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
}

const sql = vercelSql;

// Hardcoded festival URL mapping (from lib/festival-links.ts)
const FESTIVAL_URLS = [
  {
    url: 'https://festival.idfa.nl/en/film/74a12e6d-5bfc-4f9a-8b46-3f00897ead76/2000-Meters-to-Andriivka/',
    titles: ['2000 meters to andriivka', 'two thousand meters to andriivka'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/4e98a274-4110-4b21-a09f-732759e6ee9f/32-Meters/',
    titles: ['32 meters', 'thirty two meters'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/8b7b601e-1118-4497-a9bc-f9cf7ae4ea2c/kabul-between-prayers/',
    titles: ['kabul between prayers'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/4763160d-d001-4909-88db-4e138073ee9e/cutting-through-rocks/',
    titles: ['cutting through rocks'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/826b8dd8-fad9-4e1f-ba9f-77bef98867f2/do-you-love-me/',
    titles: ['do you love me'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/175c9e45-48e5-4a23-ad7f-dbdf526d7971/whispers-in-the-woods/',
    titles: ['whispers in the woods'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/70c56a94-2f14-406a-b220-49c0bb35e867/love+war/',
    titles: ['love war', 'love+war', 'love & war'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/ae99be0e-f87c-46f9-ae0f-eb5a469f2256/we-want-the-funk!/',
    titles: ['we want the funk', 'we want the funk!'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/fa4c3909-7b7f-458f-a5ec-31b0eb160dab/coexistence-my-ass!/',
    titles: ['coexistence my ass', 'coexistence, my ass', 'coexistence my ass!', 'coexistence, my ass!'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/f9352b2a-ff9c-4b2a-a998-15f5ca9f932e/queer-as-punk/',
    titles: ['queer as punk'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/331618e7-57e7-46fc-9620-624b779f1341/ghost-elephants/',
    titles: ['ghost elephants'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/f66ed1da-5517-43ee-b61b-bd1336cba970/how-to-build-a-library/',
    titles: ['how to build a library'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/ddeb5e8b-73a4-458f-9ef5-2de55890cf36/better-go-mad-in-the-wild/',
    titles: ['better go mad in the wild'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/393e7fc3-9aae-44cd-9179-68f70eebbddb/monikondee/',
    titles: ['monikondee'],
  },
  {
    url: 'https://festival.idfa.nl/en/film/3fdc3d6e-9731-479c-b391-c7a99bb6c45f/the-underground-orchestra/',
    titles: ['the underground orchestra', 'underground orchestra'],
  },
];

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFestivalLinkFromMapping(movieTitle) {
  const normalized = normalizeTitle(movieTitle);
  
  for (const entry of FESTIVAL_URLS) {
    for (const title of entry.titles) {
      if (normalizeTitle(title) === normalized) {
        return entry.url;
      }
    }
  }
  
  // Try fuzzy matching
  for (const entry of FESTIVAL_URLS) {
    for (const title of entry.titles) {
      const normalizedKey = normalizeTitle(title);
      const titleWords = normalized.split(' ').filter(w => w.length > 2);
      const keyWords = normalizedKey.split(' ').filter(w => w.length > 2);
      
      if (titleWords.length > 0 && keyWords.length > 0) {
        const matchingWords = titleWords.filter(word => keyWords.includes(word));
        const matchRatio = matchingWords.length / Math.max(titleWords.length, keyWords.length);
        
        if (matchRatio >= 0.7) {
          return entry.url;
        }
      }
      
      if (normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
        return entry.url;
      }
    }
  }
  
  return null;
}

async function findFestivalLinkWithAI(movieTitle) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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

    let url = content.trim();
    url = url.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    url = url.trim();
    
    if (url.startsWith('http') && 
        (url.includes('festival.idfa.nl/en/film/') || url.includes('festival.idfa.nl/en/composition/'))) {
      return url.endsWith('/') ? url : `${url}/`;
    }

    return null;
  } catch (error) {
    console.warn('AI search failed:', error.message || error);
    return null;
  }
}

async function backfillFestivalLinks() {
  console.log('Starting festival link backfill...\n');

  // Get all tickets without festival links
  const tickets = await sql`
    SELECT DISTINCT act
    FROM tickets
    WHERE festival_link IS NULL
    ORDER BY act
  `;

  if (tickets.rows.length === 0) {
    console.log('No tickets found without festival links.');
    return;
  }

  console.log(`Found ${tickets.rows.length} unique movies without festival links.\n`);

  let updated = 0;
  let found = 0;
  let notFound = 0;

  for (const row of tickets.rows) {
    const act = row.act;
    console.log(`Processing: "${act}"...`);

    // Try AI first
    let festivalLink = null;
    
    try {
      console.log('  → Trying AI search...');
      festivalLink = await findFestivalLinkWithAI(act);
    } catch (error) {
      console.warn(`  → AI search failed:`, error.message || error);
    }

    // Fall back to hardcoded mapping if AI didn't find it
    if (!festivalLink) {
      console.log('  → Trying hardcoded mapping...');
      festivalLink = getFestivalLinkFromMapping(act);
    }

    if (festivalLink) {
      // Update all tickets with this act
      const result = await sql`
        UPDATE tickets
        SET festival_link = ${festivalLink}
        WHERE act = ${act} AND festival_link IS NULL
        RETURNING id
      `;

      const count = result.rowCount || 0;
      updated += count;
      found++;
      console.log(`  ✓ Found link: ${festivalLink}`);
      console.log(`  ✓ Updated ${count} ticket(s)\n`);
    } else {
      notFound++;
      console.log(`  ✗ No link found\n`);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n--- Summary ---');
  console.log(`Total movies processed: ${tickets.rows.length}`);
  console.log(`Movies with links found: ${found}`);
  console.log(`Movies without links: ${notFound}`);
  console.log(`Total tickets updated: ${updated}`);
}

backfillFestivalLinks()
  .then(() => {
    console.log('\nBackfill complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during backfill:', error);
    process.exit(1);
  });
