import { randomBytes, createHmac } from 'node:crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Byte length of the random token payload. 32 bytes = 64 hex chars. */
const TOKEN_BYTES = 32;

/** Regex that a valid token must satisfy. */
const TOKEN_REGEX = /^[0-9a-f]{64}$/;

/** Prefix added to scope tokens and avoid collision with other hex strings. */
const TOKEN_PREFIX = 'gayi_inv_';

// ─── Token generation ─────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random, opaque invite token.
 *
 * Format: `gayi_inv_<64 hex chars>`
 */
export function generateInviteToken(): string {
  const bytes = randomBytes(TOKEN_BYTES);
  return TOKEN_PREFIX + bytes.toString('hex');
}

// ─── Token validation ─────────────────────────────────────────────────────────

/**
 * Validate the format of an invite token. This checks structural integrity
 * only — it does not verify that the token exists in any store or has not
 * been redeemed. Persist and check token state server-side.
 *
 * Returns `true` if the token is structurally valid.
 */
export function validateInviteToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const payload = token.slice(TOKEN_PREFIX.length);
  return TOKEN_REGEX.test(payload);
}

// ─── HMAC-signed tokens (optional enhanced variant) ──────────────────────────

export interface SignedToken {
  /** Opaque token string (prefix + payload + '.' + hmac) */
  token: string;
  /** ISO timestamp of generation (for TTL checks) */
  issuedAt: string;
}

/**
 * Generate an HMAC-signed invite token that embeds an issuedAt timestamp.
 * Requires a 32-byte+ secret key for signing.
 *
 * The token format is: `gayi_inv_<hex>.<hmac-sha256-hex>`
 * This does NOT replace server-side revocation — always cross-check the store.
 */
export function generateSignedInviteToken(secret: string): SignedToken {
  const payload = randomBytes(TOKEN_BYTES).toString('hex');
  const issuedAt = new Date().toISOString();
  const message = `${payload}:${issuedAt}`;
  const hmac = createHmac('sha256', secret).update(message).digest('hex');
  return {
    token: `${TOKEN_PREFIX}${payload}.${hmac}`,
    issuedAt,
  };
}

/**
 * Verify the HMAC signature on a signed invite token. Returns `true` if the
 * signature is valid. Does not check expiry — caller must compare `issuedAt`.
 */
export function verifySignedInviteToken(
  token: string,
  issuedAt: string,
  secret: string,
): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const rest = token.slice(TOKEN_PREFIX.length);
  const dotIdx = rest.lastIndexOf('.');
  if (dotIdx === -1) return false;

  const payload = rest.slice(0, dotIdx);
  const providedHmac = rest.slice(dotIdx + 1);

  if (!TOKEN_REGEX.test(payload)) return false;

  const message = `${payload}:${issuedAt}`;
  const expectedHmac = createHmac('sha256', secret).update(message).digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (expectedHmac.length !== providedHmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHmac.length; i++) {
    diff |= expectedHmac.charCodeAt(i) ^ (providedHmac.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}
