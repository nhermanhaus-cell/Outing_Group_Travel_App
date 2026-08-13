export const CONTENT_DENSITY = {
  horizontalCardWidth: 184,
  horizontalCardImageHeight: 158,
  destinationTileImageHeight: 148,
  compactSectionGap: 12,
  compactCardGap: 12,
  detailStickyBarHeight: 94,
} as const;

export function destinationGridColumns(width: number): number {
  return width >= 760 ? 3 : 2;
}

export function destinationTileWidth(width: number, horizontalPadding = 16, gap = 12): number {
  const columns = destinationGridColumns(width);
  return Math.floor((Math.max(320, width) - horizontalPadding * 2 - gap * (columns - 1)) / columns);
}
