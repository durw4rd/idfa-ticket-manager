import { describe, expect, it } from 'vitest';
import { cleanPlaceName, parseFilmPlaceAnswer, pickCoordinates, placeUnlessCountry, type ModelPlace } from './film-place';

describe('parseFilmPlaceAnswer', () => {
  it('reads a plain JSON answer', () => {
    expect(parseFilmPlaceAnswer('{"place":"Kabul","country":"AF","lat":34.5,"lon":69.2}')).toEqual({
      placeName: 'Kabul',
      country: 'AF',
      estimate: { lat: 34.5, lon: 69.2 },
    });
  });

  it('reads JSON in a code fence, and a provider that already parsed it', () => {
    const fenced = '```json\n{"place": null, "country": "pt", "lat": 39.6, "lon": -8.0}\n```';
    expect(parseFilmPlaceAnswer(fenced)).toEqual({ placeName: null, country: 'PT', estimate: { lat: 39.6, lon: -8 } });
    expect(parseFilmPlaceAnswer({ place: 'Gaza', country: 'PS', lat: 31.5, lon: 34.47 })).toMatchObject({
      placeName: 'Gaza',
      country: 'PS',
    });
  });

  it("treats a null country as the model's answer that there's no real-world place", () => {
    expect(parseFilmPlaceAnswer('{"place":null,"country":null,"lat":null,"lon":null}')).toBe('none');
  });

  it('rejects answers that are not usable so the fallback can try', () => {
    expect(parseFilmPlaceAnswer('Kabul, Afghanistan')).toBeNull();
    expect(parseFilmPlaceAnswer('{"place":"Atlantis","country":"ZZ","lat":0,"lon":0}')).toBeNull();
    expect(parseFilmPlaceAnswer('["AF"]')).toBeNull();
    expect(parseFilmPlaceAnswer(undefined)).toBeNull();
  });

  it('keeps the place but drops an estimate outside the country', () => {
    // Lisbon's coordinates for a place said to be in Afghanistan
    expect(parseFilmPlaceAnswer('{"place":"Kabul","country":"AF","lat":38.7,"lon":-9.1}')).toEqual({
      placeName: 'Kabul',
      country: 'AF',
      estimate: null,
    });
  });
});

describe('cleanPlaceName', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanPlaceName('  Rio   de Janeiro ')).toBe('Rio de Janeiro');
    expect(cleanPlaceName('   ')).toBeNull();
    expect(cleanPlaceName(42)).toBeNull();
    expect(cleanPlaceName('x'.repeat(200))).toHaveLength(80);
  });
});

describe('pickCoordinates', () => {
  const kabul: ModelPlace = { placeName: 'Kabul', country: 'AF', estimate: { lat: 34.5, lon: 69.2 } };

  it('takes the geocoder hit nearest the estimate', () => {
    const picked = pickCoordinates(kabul, [
      { name: 'Kābulī', lat: 33.44, lon: 68.34 },
      { name: 'Kabul', lat: 34.528, lon: 69.172 },
    ]);
    expect(picked).toEqual({ placeName: 'Kabul', lat: 34.528, lon: 69.172 });
  });

  it('keeps the estimate when every hit is a namesake far away', () => {
    const picked = pickCoordinates(kabul, [{ name: 'Kābul', lat: 36.7, lon: 67.1 }]);
    expect(picked).toEqual({ placeName: 'Kabul', lat: 34.5, lon: 69.2 });
  });

  it('takes the top hit when there is no estimate', () => {
    const lisbon: ModelPlace = { placeName: 'Lisbon', country: 'PT', estimate: null };
    expect(pickCoordinates(lisbon, [{ name: 'Lisbon', lat: 38.725, lon: -9.15 }])).toEqual({
      placeName: 'Lisbon',
      lat: 38.725,
      lon: -9.15,
    });
  });

  it('ignores hits outside the country', () => {
    const lisbon: ModelPlace = { placeName: 'Lisbon', country: 'PT', estimate: null };
    const picked = pickCoordinates(lisbon, [{ name: 'Lisbon', lat: 41.4, lon: -71.6 }]);
    expect(picked.placeName).toBeNull();
  });

  it("falls back to the country's centre, without a place name it no longer marks", () => {
    const marsh: ModelPlace = { placeName: 'Chibayish', country: 'IQ', estimate: null };
    const picked = pickCoordinates(marsh, []);
    expect(picked.placeName).toBeNull();
    expect(picked.lat).toBeCloseTo(32.6, 0);
    expect(picked.lon).toBeCloseTo(44.4, -1);
  });
});

describe('placeUnlessCountry', () => {
  it('drops a place that only repeats the country, under its own or a common other name', () => {
    expect(placeUnlessCountry('Ukraine', 'UA', 'Ukraine')).toBeNull();
    expect(placeUnlessCountry('Czech Republic', 'CZ', 'Czechia')).toBeNull();
    expect(placeUnlessCountry('Ivory Coast', 'CI', "Côte d'Ivoire")).toBeNull();
    expect(placeUnlessCountry('the United States', 'US', 'United States')).toBeNull();
    expect(placeUnlessCountry('Southwestern Iran', 'IR', 'Iran')).toBeNull();
    expect(placeUnlessCountry('rural Iran', 'IR', 'Iran')).toBeNull();
    expect(placeUnlessCountry('north-east Brazil', 'BR', 'Brazil')).toBeNull();
  });

  it('keeps real places, including ones named after the country', () => {
    expect(placeUnlessCountry('Kabul', 'AF', 'Afghanistan')).toBe('Kabul');
    expect(placeUnlessCountry('Mexico City', 'MX', 'Mexico')).toBe('Mexico City');
    expect(placeUnlessCountry('Central Java', 'ID', 'Indonesia')).toBe('Central Java');
    expect(placeUnlessCountry('South Sudan', 'SD', 'Sudan')).toBe('South Sudan');
    expect(placeUnlessCountry(null, 'IR', 'Iran')).toBeNull();
  });

  it('applies to model answers', () => {
    expect(parseFilmPlaceAnswer('{"place":"Iran","country":"IR","lat":32,"lon":53}')).toMatchObject({ placeName: null, country: 'IR' });
  });
});
