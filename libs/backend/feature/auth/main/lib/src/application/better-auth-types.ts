/**
 * Explicitly-typed interfaces at the Better-Auth boundary.
 *
 * Replaces `any` casts throughout the auth integration layer with
 * narrow, purpose-built types that are safe to work with.
 */

// ─── Internal Adapter Return Types ──────────────────────────────────────

export interface BetterAuthDbRecord {
  id?: string;
  [key: string]: unknown;
}

export interface BetterAuthDbRow {
  id?: string;
  [key: string]: unknown;
}

// ─── Session / Context Types ────────────────────────────────────────────

export interface BetterAuthUser extends Record<string, unknown> {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
  status?: string;
  locale?: string;
  theme?: string;
}

export interface BetterAuthSessionData {
  user: BetterAuthUser;
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
  };
}

export interface BetterAuthContextWrapper {
  operationId?: string;
  context?: {
    newSession?: {
      user?: BetterAuthUser;
      session?: Record<string, unknown>;
      token?: string;
    };
    session?: {
      user?: BetterAuthUser;
      session?: Record<string, unknown>;
      token?: string;
    };
  };
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

// ─── Handler Types ──────────────────────────────────────────────────────

export type BetterAuthHandler = (request: Request) => Promise<Response>;

// ─── Auth Instance Extension ────────────────────────────────────────────

export interface BetterAuthInstance {
  api: Record<string, unknown>;
  handler?: BetterAuthHandler;
}

// ─── MikroORM Adapter Data Types ────────────────────────────────────────

export interface BetterAuthCreateData {
  id?: string;
  [key: string]: unknown;
}

export interface BetterAuthUpdateData {
  [key: string]: unknown;
}

export interface BetterAuthIncrementData {
  [key: string]: number;
}

export interface BetterAuthSetData {
  [key: string]: unknown;
}

// ─── Account / Identity Types ───────────────────────────────────────────

export interface BetterAuthAccount {
  id: string;
  providerId?: string;
  providerAccountId?: string;
  providerSubject?: string;
  channel?: string | null;
}

// ─── Link Token Types (replacing globalThis store) ──────────────────────

export interface LinkTokenEntry {
  tenantId: string;
  userId: string;
  provider: string;
  purpose: string;
  tokenHash: string;
  deepLinkMetadata: Record<string, string>;
  expiresAt: Date;
}

// ─── Request Body Types ─────────────────────────────────────────────────

export interface TelegramWebLoginPayload {
  auth_date: string;
  hash: string;
  id?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  [key: string]: unknown;
}

// ─── Unwrappable Context Output ─────────────────────────────────────────

export interface BetterAuthContextOutput {
  user?: BetterAuthUser;
  session?: Record<string, unknown>;
  token?: string;
  success?: boolean;
  error?: string;
  message?: string;
}
