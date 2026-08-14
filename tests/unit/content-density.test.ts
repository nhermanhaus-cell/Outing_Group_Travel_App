import { describe, expect, it } from 'vitest';
import {
  CONTENT_DENSITY,
  destinationGridColumns,
  destinationTileWidth,
} from '../../apps/mobile/src/lib/content-density';

describe('mobile content density', () => {
  it('keeps phone discovery in a two-column image-led grid', () => {
    expect(destinationGridColumns(390)).toBe(2);
    expect(destinationTileWidth(390)).toBe(173);
  });

  it('adds a third destination column on wide layouts', () => {
    expect(destinationGridColumns(768)).toBe(3);
    expect(destinationTileWidth(768)).toBe(237);
  });

  it('uses consistent compact rail dimensions', () => {
    expect(CONTENT_DENSITY.horizontalCardWidth).toBeLessThan(200);
    expect(CONTENT_DENSITY.horizontalCardImageHeight).toBeGreaterThan(140);
    expect(CONTENT_DENSITY.compactCardGap).toBeLessThanOrEqual(12);
  });
});
