/**
 * Utilities for generating map links
 */

/**
 * Generates a Google Maps search URL for a location
 * Appends "Amsterdam" to ensure we find the correct venue
 */
export function getMapSearchUrl(location: string): string {
  // Clean up location name (remove room numbers, extra spaces, etc.)
  const cleanLocation = location
    .replace(/\s+\d+$/, '') // Remove trailing numbers (e.g., "Kriterion 1" -> "Kriterion")
    .trim();
  
  // Append "Amsterdam" to improve search accuracy
  const searchQuery = encodeURIComponent(`${cleanLocation}, Amsterdam`);
  
  return `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
}

