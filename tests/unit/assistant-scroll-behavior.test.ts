import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../apps/mobile/components/assistant/AssistantChat.tsx', import.meta.url),
  'utf8',
);

describe('Ask Outing turn navigation', () => {
  it('anchors the submitted prompt instead of snapping to the conversation bottom', () => {
    expect(source).toContain('anchorTurnAtTop');
    expect(source).toContain('scrollRef.current?.scrollTo({ y, animated: true })');
    expect(source).not.toContain('scrollToEnd');
  });

  it('keeps enough trailing room for the response to stream below the anchored prompt', () => {
    expect(source).toContain('activeTurnUserId');
    expect(source).toContain('Math.round(windowHeight * 0.58)');
    expect(source).toContain('AssistantThinkingIndicator');
  });
});
