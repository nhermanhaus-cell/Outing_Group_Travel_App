type JsonRecord = Record<string, unknown>;

const TEXT_KEYS = new Set([
  'additionalInfo',
  'address',
  'categoryDescription',
  'description',
  'details',
  'end',
  'endPoint',
  'inclusions',
  'exclusions',
  'itineraryItems',
  'items',
  'location',
  'logistics',
  'meetingPoint',
  'name',
  'otherDescription',
  'pickupDetails',
  'pointOfInterestLocation',
  'policyDescription',
  'start',
  'steps',
  'text',
  'title',
  'travelerPickup',
  'typeDescription',
  'unstructuredDescription',
]);

const TECHNICAL_KEYS = new Set([
  'id',
  'ref',
  'code',
  'type',
  'unit',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'productCode',
  'attractionId',
  'destinationId',
  'fixedDurationInMinutes',
  'variableDurationFromMinutes',
  'variableDurationToMinutes',
  'passByWithoutStopping',
  'admissionIncluded',
  'allowCustomTravelerPickup',
  'pickupOptionType',
  'pickupType',
  'itineraryType',
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cleanExperienceText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const decoded = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return decoded || undefined;
}

export function compactExperienceSummary(
  value: unknown,
  fallback: string,
  maximumLength = 150,
): string {
  const text = cleanExperienceText(value) ?? fallback;
  if (text.length <= maximumLength) return text;

  const firstSentence = text.match(/^.{24,}?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= maximumLength) return firstSentence;

  const clipped = text.slice(0, Math.max(1, maximumLength - 1));
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > maximumLength * 0.65 ? lastSpace : clipped.length).trim()}…`;
}

function looksTechnical(value: string): boolean {
  return /^[A-Z0-9_]{3,}$/.test(value)
    || /^https?:\/\//i.test(value)
    || /^[a-f0-9-]{24,}$/i.test(value);
}

export function experienceDetailLines(value: unknown, maximumLines = 8): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: unknown) => {
    const text = cleanExperienceText(candidate);
    if (!text || looksTechnical(text)) return;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(text);
  };

  const visit = (node: unknown, depth: number, allowString: boolean) => {
    if (depth > 8 || lines.length >= maximumLines || node == null) return;
    if (typeof node === 'string') {
      if (allowString) add(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1, true));
      return;
    }
    if (!isRecord(node)) return;

    for (const [key, child] of Object.entries(node)) {
      if (lines.length >= maximumLines || TECHNICAL_KEYS.has(key)) continue;
      if (TEXT_KEYS.has(key)) visit(child, depth + 1, true);
    }
  };

  visit(value, 0, true);
  return lines.slice(0, maximumLines);
}
