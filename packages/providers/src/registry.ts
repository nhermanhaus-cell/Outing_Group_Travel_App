import type { Slot } from './slots.js';

// ── Core types ────────────────────────────────────────────────────────────────

export interface SourceMeta {
  source: string;
  retrievedAt: string;
  /** 0–1 confidence score */
  confidence: number;
  isLive: boolean;
}

export interface PluginHandle<TReq = unknown, TRes = unknown> {
  call(req: TReq): Promise<TRes>;
}

export interface ProviderPlugin<TReq = unknown, TRes = unknown> {
  id: string;
  slot: Slot;
  label: string;
  description?: string;
  requiredEnv?: readonly string[];
  isMock: boolean;
  create(): PluginHandle<TReq, TRes>;
  healthCheck?(): Promise<boolean>;
}

// ── defineProviderPlugin ──────────────────────────────────────────────────────

export function defineProviderPlugin<TReq, TRes>(
  def: Omit<ProviderPlugin<TReq, TRes>, 'isMock'> & { isMock?: boolean },
): ProviderPlugin<TReq, TRes> {
  return { isMock: false, ...def };
}

// ── ProviderRegistry ──────────────────────────────────────────────────────────

export class ProviderRegistry {
  private readonly plugins = new Map<string, ProviderPlugin[]>();
  private readonly overrides = new Map<string, string>();

  register(plugin: ProviderPlugin): void {
    const list = this.plugins.get(plugin.slot) ?? [];
    list.push(plugin);
    this.plugins.set(plugin.slot, list);
  }

  list(slot: string): ProviderPlugin[] {
    return this.plugins.get(slot) ?? [];
  }

  setOverride(slot: string, pluginId: string): void {
    this.overrides.set(slot, pluginId);
  }

  clearOverrides(): void {
    this.overrides.clear();
  }

  async getActive(slot: string): Promise<ProviderPlugin | undefined> {
    const plugins = this.list(slot);
    if (!plugins.length) return undefined;

    // 1. In-app override
    const overrideId = this.overrides.get(slot);
    if (overrideId) {
      const found = plugins.find((p) => p.id === overrideId);
      if (found) return found;
    }

    // 2. Env override: GAYI_PROVIDER_<SLOT> (uppercase, camelCase → SCREAMING_SNAKE)
    const envKey = `GAYI_PROVIDER_${toScreamingSnake(slot)}`;
    const envId = getEnv(envKey);
    if (envId) {
      const found = plugins.find((p) => p.id === envId);
      if (found) return found;
    }

    // 3. First non-mock plugin with all required env keys present AND healthy
    for (const p of plugins) {
      if (p.isMock) continue;
      const keysPresent =
        !p.requiredEnv?.length || p.requiredEnv.every((k) => !!getEnv(k));
      if (!keysPresent) continue;
      if (p.healthCheck) {
        const healthy = await p.healthCheck().catch(() => false);
        if (!healthy) continue;
      }
      return p;
    }

    // 4. Mock fallback
    return plugins.find((p) => p.isMock) ?? plugins[0];
  }

  async resolve<TReq = unknown, TRes = unknown>(
    slot: string,
  ): Promise<PluginHandle<TReq, TRes>> {
    const plugin = await this.getActive(slot);
    if (!plugin) throw new Error(`No plugin registered for slot "${slot}"`);
    return plugin.create() as PluginHandle<TReq, TRes>;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function withTimeout<TReq, TRes>(
  handle: PluginHandle<TReq, TRes>,
  ms: number,
): PluginHandle<TReq, TRes> {
  return {
    call(req: TReq): Promise<TRes> {
      return Promise.race([
        handle.call(req),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Provider timed out after ${ms}ms`)),
            ms,
          ),
        ),
      ]);
    },
  };
}

export function withSourceMeta<TReq, TRes extends object>(
  handle: PluginHandle<TReq, TRes>,
  defaults: Partial<SourceMeta> = {},
): PluginHandle<TReq, TRes & SourceMeta> {
  return {
    async call(req: TReq): Promise<TRes & SourceMeta> {
      const data = await handle.call(req);
      const meta: SourceMeta = {
        source: defaults.source ?? 'unknown',
        retrievedAt: new Date().toISOString(),
        confidence: defaults.confidence ?? 1,
        isLive: defaults.isLive ?? false,
      };
      return { ...data, ...meta };
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toScreamingSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toUpperCase();
}

function getEnv(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}
