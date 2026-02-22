import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Bridge authentication utilities for Nexus ↔ Billing Agent communication.
 */

/** SHA-256 hash a key for comparison */
export function hashBridgeKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Validate inbound bridge API key from request */
export function validateBridgeApiKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  const expectedHash = process.env.BRIDGE_API_KEY_HASH;

  if (!expectedHash) {
    console.error('Bridge: BRIDGE_API_KEY_HASH env var is not configured');
    return false;
  }

  const tokenHash = hashBridgeKey(token);
  return tokenHash === expectedHash;
}

/** Get auth headers for outbound requests to Nexus */
export function getNexusBridgeHeaders(): Record<string, string> {
  const apiKey = process.env.NEXUS_BRIDGE_API_KEY;
  if (!apiKey) {
    throw new Error('Bridge: NEXUS_BRIDGE_API_KEY env var is not configured');
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Build full URL for Nexus Convex HTTP endpoint */
export function getNexusConvexUrl(path: string): string {
  const baseUrl = process.env.NEXUS_CONVEX_URL;
  if (!baseUrl) {
    throw new Error('Bridge: NEXUS_CONVEX_URL env var is not configured');
  }

  return `${baseUrl}${path}`;
}
