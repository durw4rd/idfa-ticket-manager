"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFestivalLinkForScreening = getFestivalLinkForScreening;
exports.getFestivalLink = getFestivalLink;
/**
 * Maps movie titles to their IDFA festival page URLs
 * The slug is extracted from the URL path
 */
// URL to movie title mapping
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
/**
 * Normalizes a movie title for matching
 * - Converts to lowercase
 * - Removes extra whitespace
 * - Removes punctuation for fuzzy matching
 * - Handles common variations
 */
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}
/**
 * Gets the festival page URL for a movie title from a screening
 * Checks the database first (from tickets), then falls back to hardcoded mapping
 */
async function getFestivalLinkForScreening(screening) {
    // First check if any ticket in this screening has a festival link
    for (const ticket of screening.tickets) {
        if (ticket.festivalLink) {
            return ticket.festivalLink;
        }
    }
    // Fall back to hardcoded mapping
    return getFestivalLink(screening.act);
}
/**
 * Gets the festival page URL for a movie title from hardcoded mapping
 * Returns null if no match is found
 */
function getFestivalLink(movieTitle) {
    const normalized = normalizeTitle(movieTitle);
    // Try exact match first with all title variations
    for (const entry of FESTIVAL_URLS) {
        for (const title of entry.titles) {
            if (normalizeTitle(title) === normalized) {
                return entry.url;
            }
        }
    }
    // Try fuzzy matching (partial word matches)
    for (const entry of FESTIVAL_URLS) {
        for (const title of entry.titles) {
            const normalizedKey = normalizeTitle(title);
            // Check if titles match (allowing for word order variations)
            const titleWords = normalized.split(' ').filter(w => w.length > 2); // Filter out short words
            const keyWords = normalizedKey.split(' ').filter(w => w.length > 2);
            // If most words match, consider it a match
            if (titleWords.length > 0 && keyWords.length > 0) {
                const matchingWords = titleWords.filter(word => keyWords.includes(word));
                const matchRatio = matchingWords.length / Math.max(titleWords.length, keyWords.length);
                if (matchRatio >= 0.7) { // 70% word match
                    return entry.url;
                }
            }
            // Fallback: simple contains check
            if (normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
                return entry.url;
            }
        }
    }
    return null;
}
