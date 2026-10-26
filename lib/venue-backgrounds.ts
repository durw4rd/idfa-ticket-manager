/**
 * Maps location names to their background image paths
 */
export function getVenueBackground(location: string): string | null {
  const locationLower = location.toLowerCase();
  
  // Map common location name variations to background files
  const venueMap: { [key: string]: string } = {
    'carre': 'bcg-carre.webp',
    'carré': 'bcg-carre.webp',
    'debalie': 'bcg-debalie.webp',
    'de balie': 'bcg-debalie.webp',
    'eye': 'bcg-eye.webp',
    'ketelhuis': 'bcg-ketelhuis.webp',
    'ketel huis': 'bcg-ketelhuis.webp',
    'kriterion': 'bcg-kriterion.webp',
    'pulse': 'bcg-pulse.webp',
    'the pulse': 'bcg-pulse.webp',
    'rialto': 'bcg-rialto.webp',
    'spiegel': 'bcg-spiegel.webp',
    'tuschinski': 'bcg-tuschinski.webp',
  };

  // Check for exact matches first
  if (venueMap[locationLower]) {
    return `/${venueMap[locationLower]}`;
  }

  // Check if location name contains any venue key
  for (const [key, filename] of Object.entries(venueMap)) {
    if (locationLower.includes(key)) {
      return `/${filename}`;
    }
  }

  return null;
}

