import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry, defineProviderPlugin } from '@gayi/providers';
import type { ProviderPlugin } from '@gayi/providers';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPlugin: ProviderPlugin = defineProviderPlugin({
  id: 'test:mock',
  slot: 'destinations',
  label: 'Test Mock',
  isMock: true,
  create() {
    return { async call() { return { destinations: [] }; } };
  },
  async healthCheck() { return true; },
});

const shellPlugin: ProviderPlugin = defineProviderPlugin({
  id: 'test:shell',
  slot: 'destinations',
  label: 'Test Shell',
  isMock: false,
  requiredEnv: ['TEST_PROVIDER_API_KEY'],
  async healthCheck() { return false; },
  create() {
    return {
      async call() {
        throw new Error('test:shell — not configured');
      },
    };
  },
});

const livePlugin: ProviderPlugin = defineProviderPlugin({
  id: 'test:live',
  slot: 'destinations',
  label: 'Test Live',
  isMock: false,
  async healthCheck() { return true; },
  create() {
    return { async call() { return { destinations: [] }; } };
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProviderRegistry — fallback', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('returns undefined for an empty slot', async () => {
    expect(await registry.getActive('destinations')).toBeUndefined();
  });

  it('falls back to mock when the only non-mock plugin fails healthCheck', async () => {
    registry.register(shellPlugin);
    registry.register(mockPlugin);
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:mock');
  });

  it('selects a non-mock plugin that passes healthCheck', async () => {
    registry.register(livePlugin);
    registry.register(mockPlugin);
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:live');
  });

  it('skips a non-mock plugin whose required env key is absent', async () => {
    registry.register(shellPlugin); // requires TEST_PROVIDER_API_KEY (not set)
    registry.register(mockPlugin);
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:mock');
  });

  it('resolve throws when no plugin is registered', async () => {
    await expect(registry.resolve('destinations')).rejects.toThrow(
      'No plugin registered for slot "destinations"',
    );
  });

  it('resolve returns a working handle that calls the active plugin', async () => {
    registry.register(mockPlugin);
    const handle = await registry.resolve('destinations');
    const result = await handle.call({ limit: 5 });
    expect(result).toEqual({ destinations: [] });
  });
});

describe('ProviderRegistry — in-app override', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.register(shellPlugin);
    registry.register(mockPlugin);
  });

  it('setOverride forces the specified plugin regardless of healthCheck', async () => {
    registry.setOverride('destinations', 'test:shell');
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:shell');
  });

  it('clearOverrides reverts to normal resolution (mock fallback)', async () => {
    registry.setOverride('destinations', 'test:shell');
    registry.clearOverrides();
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:mock');
  });

  it('override for an unknown plugin id is ignored and falls back normally', async () => {
    registry.setOverride('destinations', 'nonexistent:plugin');
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:mock');
  });
});

describe('ProviderRegistry — env override', () => {
  let registry: ProviderRegistry;
  const ENV_KEY = 'GAYI_PROVIDER_DESTINATIONS';

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.register(mockPlugin);
    registry.register(shellPlugin);
    registry.register(livePlugin);
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('selects plugin by id when GAYI_PROVIDER_<SLOT> is set', async () => {
    process.env[ENV_KEY] = 'test:mock';
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:mock');
  });

  it('env override selects a shell plugin regardless of healthCheck', async () => {
    process.env[ENV_KEY] = 'test:shell';
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:shell');
  });

  it('in-app override wins over env override', async () => {
    process.env[ENV_KEY] = 'test:shell';
    registry.setOverride('destinations', 'test:mock');
    const active = await registry.getActive('destinations');
    expect(active?.id).toBe('test:mock');
  });
});

describe('ProviderRegistry — list', () => {
  it('list returns all registered plugins for a slot in insertion order', () => {
    const registry = new ProviderRegistry();
    registry.register(shellPlugin);
    registry.register(mockPlugin);
    const list = registry.list('destinations');
    expect(list.map((p) => p.id)).toEqual(['test:shell', 'test:mock']);
  });

  it('list returns empty array for unregistered slots', () => {
    const registry = new ProviderRegistry();
    expect(registry.list('destinations')).toEqual([]);
  });
});
