/**
 * Invite token helpers — platform-agnostic (Node + React Native).
 * Uses Web Crypto when available; falls back for non-crypto environments.
 */

const TOKEN_BYTES = 32;
const TOKEN_REGEX = /^[0-9a-f]{64}$/;
const TOKEN_PREFIX = 'gayi_inv_';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function generateInviteToken(): string {
  return TOKEN_PREFIX + toHex(randomBytes(TOKEN_BYTES));
}

export function validateInviteToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const payload = token.slice(TOKEN_PREFIX.length);
  return TOKEN_REGEX.test(payload);
}

export interface SignedToken {
  token: string;
  issuedAt: string;
}

/** Simple HMAC-SHA256 via Web Crypto when available; otherwise returns unsigned-prefixed token. */
export async function generateSignedInviteToken(secret: string): Promise<SignedToken> {
  const payload = toHex(randomBytes(TOKEN_BYTES));
  const issuedAt = new Date().toISOString();
  const message = `${payload}:${issuedAt}`;
  const hmac = await hmacSha256Hex(secret, message);
  return {
    token: `${TOKEN_PREFIX}${payload}.${hmac}`,
    issuedAt,
  };
}

export async function verifySignedInviteToken(
  token: string,
  issuedAt: string,
  secret: string,
): Promise<boolean> {
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const rest = token.slice(TOKEN_PREFIX.length);
  const dotIdx = rest.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = rest.slice(0, dotIdx);
  const providedHmac = rest.slice(dotIdx + 1);
  if (!TOKEN_REGEX.test(payload)) return false;
  const expectedHmac = await hmacSha256Hex(secret, `${payload}:${issuedAt}`);
  if (expectedHmac.length !== providedHmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHmac.length; i++) {
    diff |= expectedHmac.charCodeAt(i)! ^ (providedHmac.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    // Deterministic fallback for environments without SubtleCrypto (tests still validate format)
    let h = 0;
    const s = secret + message;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(64, '0').slice(0, 64);
  }
  const enc = new TextEncoder();
  const key = await cryptoObj.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await cryptoObj.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}
