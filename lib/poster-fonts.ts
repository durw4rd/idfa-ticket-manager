// Fonts for the agenda poster (next/og). Satori needs TTF/OTF, not the woff2 next/font serves, so
// static Archivo instances are fetched from Google Fonts once per server instance and kept in memory.
// If that fails, the poster falls back to next/og's built-in font rather than not rendering.

type PosterFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: 'normal' };

const FACES = [
  { query: 'Archivo:wdth,wght@87.5,700', name: 'Archivo Display', weight: 700 },
  { query: 'Archivo:wght@500', name: 'Archivo', weight: 500 },
] as const;

let cached: Promise<PosterFont[]> | null = null;

async function loadFace(query: string): Promise<ArrayBuffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${query}`).then((res) => res.text());
  const url = css.match(/src: url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) {
    throw new Error(`No TTF in Google Fonts response for ${query}`);
  }
  return fetch(url).then((res) => res.arrayBuffer());
}

export function getPosterFonts(): Promise<PosterFont[]> {
  if (!cached) {
    cached = Promise.all(
      FACES.map(async (face) => ({
        name: face.name,
        data: await loadFace(face.query),
        weight: face.weight,
        style: 'normal' as const,
      }))
    ).catch((error) => {
      console.error('Poster fonts unavailable, using the default font:', error);
      cached = null; // Try again on the next request
      return [];
    });
  }
  return cached;
}
