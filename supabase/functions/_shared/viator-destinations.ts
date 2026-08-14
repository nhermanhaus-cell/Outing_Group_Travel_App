export interface ViatorDestinationCenter {
  latitude: number;
  longitude: number;
}

export interface ViatorDestinationTaxonomyItem {
  destinationId: string;
  name: string;
  type?: string;
  parentDestinationId?: string;
  lookupId?: string;
  defaultCurrencyCode?: string;
  timeZone?: string;
  center?: ViatorDestinationCenter;
}

export interface ViatorDestinationQuery {
  name: string;
  country?: string;
  lat?: number;
  lng?: number;
  destinationType?: 'city' | 'island' | 'resort_area';
}

export interface ResolvedViatorDestination extends ViatorDestinationTaxonomyItem {
  distanceKm?: number;
  matchScore: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function normalizeViatorDestination(value: unknown): ViatorDestinationTaxonomyItem | null {
  const item = record(value);
  if (!item) return null;
  const destinationId = text(item.destinationId) ?? text(item.id)
    ?? (numeric(item.destinationId) !== undefined ? String(numeric(item.destinationId)) : undefined);
  const name = text(item.name) ?? text(item.destinationName);
  if (!destinationId || !name) return null;
  const center = record(item.center);
  const latitude = center ? numeric(center.latitude) : undefined;
  const longitude = center ? numeric(center.longitude) : undefined;
  return {
    destinationId,
    name,
    type: text(item.type),
    parentDestinationId: text(item.parentDestinationId)
      ?? (numeric(item.parentDestinationId) !== undefined ? String(numeric(item.parentDestinationId)) : undefined),
    lookupId: text(item.lookupId),
    defaultCurrencyCode: text(item.defaultCurrencyCode),
    timeZone: text(item.timeZone),
    center: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
  };
}

export function normalizeViatorTaxonomy(value: unknown): ViatorDestinationTaxonomyItem[] {
  const root = record(value);
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(root?.destinations)
      ? root.destinations
      : Array.isArray(root?.data)
        ? root.data
        : [];
  return raw.map(normalizeViatorDestination).filter((item): item is ViatorDestinationTaxonomyItem => Boolean(item));
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bnew york city\b/g, 'new york')
    .replace(/\bwashington dc\b/g, 'washington')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function countryKey(value: string): string {
  const normalized = normalizeName(value);
  const aliases: Record<string, string> = {
    'united states of america': 'united states',
    usa: 'united states',
    us: 'united states',
    uk: 'united kingdom',
    'republic of korea': 'south korea',
    korea: 'south korea',
    'hong kong sar china': 'hong kong',
    'hong kong sar': 'hong kong',
    turkey: 'turkiye',
  };
  return aliases[normalized] ?? normalized;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeName(value).split(' ').filter((token) => token.length > 1));
}

function tokenOverlap(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.min(a.size, b.size);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineageNames(
  item: ViatorDestinationTaxonomyItem,
  byId: Map<string, ViatorDestinationTaxonomyItem>,
): string[] {
  const names = [item.name];
  const lineageIds = item.lookupId?.split('.').filter(Boolean) ?? [];
  for (const id of lineageIds) {
    const ancestor = byId.get(id);
    if (ancestor && !names.includes(ancestor.name)) names.push(ancestor.name);
  }
  let parentId = item.parentDestinationId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId) && visited.size < 12) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (!names.includes(parent.name)) names.push(parent.name);
    parentId = parent.parentDestinationId;
  }
  return names;
}

function typeScore(type: string | undefined, desired: ViatorDestinationQuery['destinationType']): number {
  const normalized = type?.toUpperCase();
  if (normalized === 'COUNTRY' || normalized === 'CONTINENT') return -80;
  if (!desired) return ['CITY', 'TOWN', 'ISLAND', 'AREA', 'REGION'].includes(normalized ?? '') ? 8 : 0;
  if (desired === 'city') return ['CITY', 'TOWN'].includes(normalized ?? '') ? 18 : 0;
  if (desired === 'island') return normalized === 'ISLAND' ? 22 : ['CITY', 'AREA', 'REGION'].includes(normalized ?? '') ? 5 : 0;
  return ['AREA', 'CITY', 'TOWN', 'REGION'].includes(normalized ?? '') ? 14 : 0;
}

/**
 * Resolve an Outing catalog destination against Viator's taxonomy. A candidate
 * must match by name or be geographically close; country lineage is used to
 * disambiguate same-name cities.
 */
export function resolveViatorDestination(
  query: ViatorDestinationQuery,
  taxonomy: ViatorDestinationTaxonomyItem[],
): ResolvedViatorDestination | null {
  const byId = new Map(taxonomy.map((item) => [item.destinationId, item]));
  const requestedName = normalizeName(query.name);
  const requestedCountry = query.country ? countryKey(query.country) : undefined;
  let best: ResolvedViatorDestination | null = null;

  for (const item of taxonomy) {
    const candidateName = normalizeName(item.name);
    const overlap = tokenOverlap(requestedName, candidateName);
    let score = typeScore(item.type, query.destinationType);
    if (candidateName === requestedName) score += 120;
    else if (requestedName.includes(candidateName) || candidateName.includes(requestedName)) score += 80;
    else score += overlap * 55;

    const lineage = lineageNames(item, byId).map(countryKey);
    if (requestedCountry) {
      if (lineage.includes(requestedCountry)) score += 35;
      else if (lineage.some((name) => name === 'united states' || name === 'united kingdom' || name === 'canada')) score -= 55;
    }

    let distanceKm: number | undefined;
    if (query.lat !== undefined && query.lng !== undefined && item.center) {
      distanceKm = haversineKm(query.lat, query.lng, item.center.latitude, item.center.longitude);
      if (distanceKm <= 15) score += 75;
      else if (distanceKm <= 50) score += 55;
      else if (distanceKm <= 150) score += 25;
      else if (distanceKm <= 300) score += 5;
      else if (distanceKm > 800) score -= 90;
    }

    const hasIdentityMatch = candidateName === requestedName
      || requestedName.includes(candidateName)
      || candidateName.includes(requestedName)
      || overlap >= 0.67
      || (distanceKm !== undefined && distanceKm <= 150);
    if (!hasIdentityMatch || score < 70) continue;
    if (!best || score > best.matchScore || (score === best.matchScore && (distanceKm ?? Infinity) < (best.distanceKm ?? Infinity))) {
      best = { ...item, distanceKm, matchScore: Math.round(score * 10) / 10 };
    }
  }

  return best;
}
