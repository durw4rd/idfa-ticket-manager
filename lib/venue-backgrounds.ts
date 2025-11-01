/**
 * Maps location names to their background image paths
 */
export function getVenueBackground(location: string): string | null {
  const locationLower = location.toLowerCase();
  
  // Map common location name variations to background files
  const venueMap: { [key: string]: string } = {
    'carre': 'bcg-carre.png',
    'carré': 'bcg-carre.png',
    'debalie': 'bcg-debalie.png',
    'de balie': 'bcg-debalie.png',
    'eye': 'bcg-eye.png',
    'ketelhuis': 'bcg-ketelhuis.png',
    'ketel huis': 'bcg-ketelhuis.png',
    'kriterion': 'bcg-kriterion.png',
    'pulse': 'bcg-pulse.png',
    'the pulse': 'bcg-pulse.png',
    'rialto': 'bcg-rialto.png',
    'spiegel': 'bcg-spiegel.png',
    'tuschinski': 'bcg-tuschinski.png',
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

