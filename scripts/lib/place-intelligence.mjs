import { createHash } from 'node:crypto';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function sentence(label, value) {
  const cleaned = text(value);
  return cleaned ? `${label}: ${cleaned}` : '';
}

function numericSentence(label, value, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${label}: ${value}${suffix}` : '';
}

function humanize(value) {
  return text(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function placeMetadataCompleteness(place) {
  const checks = [
    text(place.name), text(place.category), text(place.summary), text(place.address),
    typeof place.lat === 'number' && typeof place.lng === 'number',
    text(place.lgbtqRelevance), typeof place.estimatedCostUsd === 'number',
    typeof place.durationMinutes === 'number', text(place.accessibilityNotes),
    text(place.websiteUri), text(place.googleMapsUri), typeof place.rating === 'number',
    typeof place.reviewCount === 'number', text(place.priceLevel),
    list(place.weekdayDescriptions).length > 0 || list(place.openingHours).length > 0,
  ];
  return Number((checks.filter(Boolean).length / checks.length).toFixed(2));
}

export function placeSourceIds(place, destinationSourceIds = []) {
  return [...new Set([
    ...destinationSourceIds,
    text(place.providerPlaceId) ? `google-place:${text(place.providerPlaceId)}` : '',
    text(place.websiteUri), text(place.googleMapsUri),
  ].filter(Boolean).map(String))].slice(0, 20);
}

function attributeLabels(place) {
  const attributes = place.attributes && typeof place.attributes === 'object' ? place.attributes : {};
  return Object.entries(attributes)
    .filter(([, value]) => value === true)
    .map(([key]) => humanize(key))
    .slice(0, 12);
}

function baseMetadata(place) {
  return {
    name: text(place.name),
    category: text(place.category) || null,
    neighborhood: text(place.neighborhood) || null,
    primaryType: text(place.primaryType) || null,
    estimatedCostUsd: typeof place.estimatedCostUsd === 'number' ? place.estimatedCostUsd : null,
    durationMinutes: typeof place.durationMinutes === 'number' ? place.durationMinutes : null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: typeof place.reviewCount === 'number' ? place.reviewCount : null,
    priceLevel: text(place.priceLevel) || null,
    businessStatus: text(place.businessStatus) || null,
    metadataCompleteness: placeMetadataCompleteness(place),
  };
}

export function buildPlaceKnowledgeChunks(place, options = {}) {
  const sourceIds = placeSourceIds(place, options.destinationSourceIds ?? []);
  const freshness = place.verifiedAt ?? options.freshness ?? null;
  const metadata = baseMetadata(place);
  const interests = list(place.interests ?? place.interestTags ?? place.tags);
  const amenities = attributeLabels(place);
  const chunks = [
    {
      chunkKind: 'place_experience',
      text: [
        text(place.name),
        sentence('Type', humanize(place.primaryType ?? place.category)),
        text(place.summary),
        sentence('Why it may matter to LGBTQ+ travelers', place.lgbtqRelevance),
        sentence('Neighborhood', place.neighborhood),
        interests.length ? `Relevant interests: ${interests.map(humanize).join(', ')}` : '',
      ].filter(Boolean).join('. '),
      sourceIds,
      freshness,
      metadata: { ...metadata, evidenceClass: 'outing_editorial' },
    },
    {
      chunkKind: 'place_planning',
      text: [
        `${text(place.name)} planning details`,
        sentence('Address or area', place.address),
        numericSentence('Typical visit', place.durationMinutes, ' minutes'),
        numericSentence('Estimated cost', place.estimatedCostUsd, ' USD'),
        sentence('Price level', humanize(place.priceLevel)),
        typeof place.rating === 'number'
          ? `Provider rating: ${place.rating}${typeof place.reviewCount === 'number' ? ` from ${place.reviewCount} reviews` : ''}`
          : '',
        sentence('Operating status', humanize(place.businessStatus)),
        list(place.weekdayDescriptions).length ? `Regular hours: ${list(place.weekdayDescriptions).join('; ')}` : '',
        place.openNow === true ? 'Currently reported open' : place.openNow === false ? 'Currently reported closed' : '',
        place.reservable === true ? 'Reservations supported' : '',
        place.bookingRequired === true ? 'Advance booking is recommended or required' : '',
      ].filter(Boolean).join('. '),
      sourceIds,
      freshness,
      metadata: { ...metadata, evidenceClass: 'provider_and_editorial_planning' },
    },
  ];

  const accessibility = text(place.accessibilityNotes);
  const accessibilityOptions = place.accessibilityOptions && typeof place.accessibilityOptions === 'object'
    ? Object.entries(place.accessibilityOptions)
      .filter(([, value]) => value === true)
      .map(([key]) => humanize(key))
    : [];
  if (accessibility || accessibilityOptions.length || amenities.length) {
    chunks.push({
      chunkKind: 'place_accessibility_amenities',
      text: [
        `${text(place.name)} accessibility and amenities`,
        sentence('Outing accessibility note', accessibility),
        accessibilityOptions.length ? `Provider-reported accessibility: ${accessibilityOptions.join(', ')}` : '',
        amenities.length ? `Provider-reported features: ${amenities.join(', ')}` : '',
      ].filter(Boolean).join('. '),
      sourceIds,
      freshness,
      metadata: { ...metadata, evidenceClass: 'provider_accessibility_and_amenities' },
    });
  }
  return chunks.filter((chunk) => text(chunk.text));
}

export function placeIntelligenceHash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
