import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import {
  inspirationImportSchema,
  type InspirationImport,
} from '@gayi/shared';
import { supabase } from './supabase';

const GUEST_QUEUE_KEY = 'outing:inspiration-guest-queue:v1';
const IMPORT_BUCKET = 'inspiration-imports';
const MAX_IMPORTS = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMPORT_FILE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'text/xml',
  'application/json', 'application/xml', 'application/vnd.google-earth.kml+xml',
]);

export type InspirationSourceInput = {
  id: string;
  kind: 'image' | 'url' | 'google_maps' | 'article' | 'social_link' | 'place_file';
  uri?: string;
  url?: string;
  label?: string;
  mimeType?: string;
  size?: number;
};

export class InspirationImportError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'InspirationImportError';
  }
}

export function classifyInspirationUrl(raw: string): InspirationSourceInput['kind'] {
  const hostname = new URL(raw).hostname.toLowerCase();
  if (hostname.includes('google.') || hostname === 'maps.app.goo.gl') return 'google_maps';
  if (['instagram.com', 'www.instagram.com', 'tiktok.com', 'www.tiktok.com', 'youtube.com', 'www.youtube.com', 'youtu.be'].includes(hostname)) {
    return 'social_link';
  }
  return 'article';
}

export function makeUrlSource(raw: string): InspirationSourceInput {
  const url = new URL(raw.trim());
  if (url.protocol !== 'https:') throw new InspirationImportError('Paste a public HTTPS link.');
  return { id: Crypto.randomUUID(), kind: classifyInspirationUrl(url.toString()), url: url.toString(), label: url.hostname };
}

function validatedSources(sources: InspirationSourceInput[]): InspirationSourceInput[] {
  if (!sources.length || sources.length > MAX_IMPORTS) throw new InspirationImportError('Choose between one and ten images or links.');
  return sources.map((source) => {
    if (source.mimeType?.startsWith('video/')) throw new InspirationImportError('Raw videos are not supported. Share the public video link instead.');
    if (source.uri && source.mimeType && !IMPORT_FILE_TYPES.has(source.mimeType.toLowerCase())) {
      throw new InspirationImportError('Use a JPG, PNG, WebP, JSON, CSV, text, or KML file.');
    }
    if (source.size !== undefined && source.size > MAX_FILE_BYTES) throw new InspirationImportError('Each imported file must be 10 MB or smaller.');
    if (!source.uri && !source.url) throw new InspirationImportError('An import source is missing its file or link.');
    return source;
  });
}

function queueDirectory(): Directory {
  const directory = new Directory(Paths.document, 'outing-inspiration-queue');
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function safeFileName(source: InspirationSourceInput): string {
  const raw = source.label?.split('/').at(-1) || `import-${source.id}`;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || `import-${source.id}`;
}

export async function persistIncomingSources(sources: InspirationSourceInput[]): Promise<InspirationSourceInput[]> {
  const directory = queueDirectory();
  return validatedSources(sources).map((source) => {
    if (!source.uri) return source;
    if (source.uri.startsWith(directory.uri)) return source;
    const original = new File(source.uri);
    if (!original.exists) throw new InspirationImportError(`Outing could not read ${source.label ?? 'that shared file'}.`);
    const destination = new File(directory, `${source.id}-${safeFileName(source)}`);
    if (destination.exists) destination.delete();
    original.copy(destination);
    return { ...source, uri: destination.uri, size: destination.size ?? source.size };
  });
}

export async function queueGuestInspiration(sources: InspirationSourceInput[]): Promise<void> {
  const persisted = await persistIncomingSources(sources);
  const current = await loadGuestInspirationQueue();
  const combined = [...current, ...persisted]
    .filter((source, index, values) => values.findIndex((value) => value.id === source.id) === index)
    .slice(-MAX_IMPORTS);
  await AsyncStorage.setItem(GUEST_QUEUE_KEY, JSON.stringify(combined));
}

export async function replaceGuestInspirationQueue(sources: InspirationSourceInput[]): Promise<void> {
  const current = await loadGuestInspirationQueue();
  const persisted = sources.length ? await persistIncomingSources(sources) : [];
  const keptUris = new Set(persisted.flatMap((source) => source.uri ? [source.uri] : []));
  for (const source of current) {
    if (!source.uri || keptUris.has(source.uri)) continue;
    try {
      const file = new File(source.uri);
      if (file.exists) file.delete();
    } catch { /* The OS may already have removed it. */ }
  }
  if (persisted.length) await AsyncStorage.setItem(GUEST_QUEUE_KEY, JSON.stringify(persisted));
  else await AsyncStorage.removeItem(GUEST_QUEUE_KEY);
}

export async function loadGuestInspirationQueue(): Promise<InspirationSourceInput[]> {
  const raw = await AsyncStorage.getItem(GUEST_QUEUE_KEY);
  if (!raw) return [];
  try { return validatedSources(JSON.parse(raw) as InspirationSourceInput[]); }
  catch { return []; }
}

export async function clearGuestInspirationQueue(): Promise<void> {
  const queued = await loadGuestInspirationQueue();
  for (const source of queued) {
    if (!source.uri) continue;
    try {
      const file = new File(source.uri);
      if (file.exists) file.delete();
    } catch { /* The OS may already have removed it. */ }
  }
  await AsyncStorage.removeItem(GUEST_QUEUE_KEY);
}

async function functionRequest(body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!supabase) throw new InspirationImportError('Outing is not connected.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new InspirationImportError('Sign in to process inspiration.', 401);
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new InspirationImportError('Inspiration importing is not configured.');
  const response = await expoFetch(`${baseUrl}/functions/v1/inspiration-import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const value = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new InspirationImportError(typeof value.error === 'string' ? value.error : 'Could not process this import.', response.status);
  return value;
}

function serverDescriptor(source: InspirationSourceInput, storagePath?: string) {
  return {
    kind: source.kind,
    ...(storagePath ? { storagePath } : {}),
    ...(source.url ? { url: source.url } : {}),
    ...(source.label ? { label: source.label } : {}),
    ...(source.mimeType ? { mimeType: source.mimeType } : {}),
  };
}

export async function processInspirationImport(
  sources: InspirationSourceInput[],
  tripId?: string,
  signal?: AbortSignal,
): Promise<InspirationImport> {
  if (!supabase) throw new InspirationImportError('Outing is not connected.');
  const inputs = validatedSources(sources);
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new InspirationImportError('Sign in to process inspiration.', 401);
  const placeholders = inputs.map((source) => serverDescriptor(
    source,
    source.uri ? `${userId}/pending/${source.id}-${safeFileName(source)}` : undefined,
  ));
  const created = await functionRequest({ action: 'create', ...(tripId ? { tripId } : {}), sources: placeholders }, signal);
  const importId = String(created.importId ?? '');
  if (!importId) throw new InspirationImportError('Outing could not start this import.');
  const descriptors = [];
  try {
    for (const source of inputs) {
      if (!source.uri) {
        descriptors.push(serverDescriptor(source));
        continue;
      }
      const path = `${userId}/${importId}/${source.id}-${safeFileName(source)}`;
      const file = new File(source.uri);
      const bytes = await file.arrayBuffer();
      const { error } = await supabase.storage.from(IMPORT_BUCKET).upload(path, bytes, {
        contentType: source.mimeType ?? 'application/octet-stream',
        upsert: false,
      });
      if (error) throw new InspirationImportError(error.message);
      descriptors.push(serverDescriptor(source, path));
    }
    const processed = await functionRequest({ action: 'process', importId, sources: descriptors }, signal);
    return inspirationImportSchema.parse(processed.import);
  } catch (error) {
    // Server expiration removes failed uploads within 24 hours.
    throw error;
  }
}

export async function loadInspirationImport(importId: string, signal?: AbortSignal): Promise<InspirationImport> {
  const body = await functionRequest({ action: 'get', importId }, signal);
  return inspirationImportSchema.parse(body.import);
}

export async function loadInspirationLibrary(signal?: AbortSignal): Promise<InspirationImport[]> {
  const body = await functionRequest({ action: 'list' }, signal);
  const imports = Array.isArray(body.imports) ? body.imports : [];
  return imports.map((value) => inspirationImportSchema.parse(value));
}

export async function reviewInspirationItem(
  importId: string,
  itemId: string,
  action: 'confirm' | 'dismiss',
  tripId?: string,
): Promise<InspirationImport> {
  const body = await functionRequest({ action, importId, itemId, ...(tripId ? { tripId } : {}) });
  return inspirationImportSchema.parse(body.import);
}

export async function deleteInspirationImport(importId: string): Promise<void> {
  await functionRequest({ action: 'delete', importId });
}
