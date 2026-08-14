export type AirportRecord = { iata: string; name: string; city: string; countryCode: string; lat: number; lng: number };
import airportData from '../../assets/public/airports.json';

export const airports = airportData.airports as AirportRecord[];
export const airportDataAttribution = `Airport data: ${airportData.source} (${airportData.license}). Updated ${airportData.retrievedAt.slice(0, 10)}.`;

export function nearestAirports(lat: number, lng: number, limit = 3) {
  return airports.map((airport) => ({ airport, distance: distanceKm(lat, lng, airport.lat, airport.lng) })).sort((a, b) => a.distance - b.distance).slice(0, limit);
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
