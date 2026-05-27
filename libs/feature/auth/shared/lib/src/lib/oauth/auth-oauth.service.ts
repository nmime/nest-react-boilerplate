import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import type {
  AuthOAuthAuthorizationInput,
  AuthOAuthAuthorizationRequest,
  AuthOAuthCallbackInput,
  AuthOAuthCallbackResult,
  AuthOAuthConfig,
  AuthOAuthConsumedState,
  AuthOAuthError,
  AuthOAuthStateStore,
  AuthOAuthStoredState,
} from "./auth-oauth.types";

export const AUTH_OAUTH_CONFIG = Symbol("AUTH_OAUTH_CONFIG");

const DefaultStateTtlMs = 10 * 60 * 1000;
const PlaceholderOrigin = "https://return.invalid";

export class InMemoryAuthOAuthStateStore implements AuthOAuthStateStore {
  private readonly statesBySession = new Map<string, AuthOAuthStoredState[]>();

  saveState(state: AuthOAuthStoredState): void {
    this.pruneExpired(state.createdAt);
    const states = this.statesBySession.get(state.sessionId) ?? [];
    states.push(state);
    this.statesBySession.set(state.sessionId, states);
  }

  consumeState(input: {
    sessionId: string;
    stateHash: string;
    now: number;
  }): AuthOAuthStoredState | undefined {
    const states = this.statesBySession.get(input.sessionId);
    if (!states) {
      return undefined;
    }

    let consumed: AuthOAuthStoredState | undefined;
    const remaining: AuthOAuthStoredState[] = [];
    for (const state of states) {
      if (state.expiresAt <= input.now) {
        continue;
      }
      if (!consumed && hashEquals(state.stateHash, input.stateHash)) {
        consumed = state;
        continue;
      }
      remaining.push(state);
    }

    if (remaining.length > 0) {
      this.statesBySession.set(input.sessionId, remaining);
    } else {
      this.statesBySession.delete(input.sessionId);
    }

    return consumed;
  }

  private pruneExpired(now: number): void {
    for (const [sessionId, states] of this.statesBySession) {
      const remaining = states.filter((state) => state.expiresAt > now);
      if (remaining.length > 0) {
        this.statesBySession.set(sessionId, remaining);
      } else {
        this.statesBySession.delete(sessionId);
      }
    }
  }
}

@Injectable()
export class AuthOAuthService {
  private readonly stateStore: AuthOAuthStateStore;

  constructor(
    @Optional()
    @Inject(AUTH_OAUTH_CONFIG)
    private readonly config: AuthOAuthConfig = {},
  ) {
    this.stateStore = config.stateStore ?? new InMemoryAuthOAuthStateStore();
  }

  buildAuthorizationRequest(
    input: AuthOAuthAuthorizationInput = {},
  ): ResultAsync<AuthOAuthAuthorizationRequest, AuthOAuthError> {
    if (!this.config.enabled) {
      return errAsync({ code: "disabled", message: "OAuth is disabled." });
    }

    const missing = this.getMissingConfiguration([
      "issuerUrl",
      "clientId",
      "redirectUri",
    ]);
    if (missing.length > 0) {
      return errAsync({
        code: "not_configured",
        message: `OAuth configuration is incomplete: ${missing.join(", ")}.`,
      });
    }

    const sessionId = normalizeSessionId(input.sessionId);
    if (!sessionId) {
      return errAsync({
        code: "invalid_request",
        message: "OAuth authorization requires a server-side session.",
      });
    }

    const returnUrl = this.validateReturnUrl(input.returnUrl);
    if (isAuthOAuthError(returnUrl)) {
      return errAsync(returnUrl);
    }

    try {
      const state = createOAuthState();
      const now = this.now();
      const stateExpiresAt = now + this.getStateTtlMs();
      const scopes = this.config.scopes ?? ["openid", "profile", "email"];
      const issuerUrl = this.config.issuerUrl as string;
      const clientId = this.config.clientId as string;
      const redirectUri = this.config.redirectUri as string;
      const authorizationUrl = new URL("authorize", issuerUrl);
      authorizationUrl.searchParams.set("client_id", clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);

      this.stateStore.saveState({
        sessionId,
        stateHash: hashOAuthValue(state),
        createdAt: now,
        expiresAt: stateExpiresAt,
        ...(returnUrl ? { returnUrl } : {}),
      });

      return okAsync({
        authorizationUrl: authorizationUrl.toString(),
        state,
        stateExpiresAt,
        ...(returnUrl ? { returnUrl } : {}),
      });
    } catch (error) {
      return errAsync({
        code: "provider_error",
        message: (error as Error).message,
      });
    }
  }

  consumeAuthorizationState(
    input: AuthOAuthCallbackInput = {},
  ): ResultAsync<AuthOAuthConsumedState, AuthOAuthError> {
    if (!this.config.enabled) {
      return errAsync({ code: "disabled", message: "OAuth is disabled." });
    }

    const consumed = this.consumeAuthorizationStateRecord(input);
    if (isAuthOAuthError(consumed)) {
      return errAsync(consumed);
    }

    return okAsync({
      sessionId: consumed.sessionId,
      stateExpiresAt: consumed.expiresAt,
      ...(consumed.returnUrl ? { returnUrl: consumed.returnUrl } : {}),
    });
  }

  handleCallback(
    input: AuthOAuthCallbackInput = {},
  ): ResultAsync<AuthOAuthCallbackResult, AuthOAuthError> {
    if (!this.config.enabled) {
      return errAsync({ code: "disabled", message: "OAuth is disabled." });
    }

    const consumed = this.consumeAuthorizationStateRecord(input);
    if (isAuthOAuthError(consumed)) {
      return errAsync(consumed);
    }

    return errAsync({
      code: "provider_error",
      message:
        "OAuth callback exchange is not configured for this boilerplate.",
    });
  }

  private consumeAuthorizationStateRecord(
    input: AuthOAuthCallbackInput,
  ): AuthOAuthStoredState | AuthOAuthError {
    const sessionId = normalizeSessionId(input.sessionId);
    const state = normalizeState(input.state);
    if (!sessionId || !state) {
      return {
        code: "invalid_state",
        message: "OAuth callback state is required for this session.",
      };
    }

    try {
      const consumed = this.stateStore.consumeState({
        sessionId,
        stateHash: hashOAuthValue(state),
        now: this.now(),
      });
      if (!consumed) {
        return {
          code: "invalid_state",
          message:
            "OAuth callback state is missing, expired, already used, or does not match this session.",
        };
      }
      return consumed;
    } catch (error) {
      return { code: "provider_error", message: (error as Error).message };
    }
  }

  private getMissingConfiguration(
    keys: Array<keyof AuthOAuthConfig>,
  ): string[] {
    return keys.filter((key) => !this.config[key]);
  }

  private getStateTtlMs(): number {
    const ttl = this.config.stateTtlMs;
    return typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0
      ? ttl
      : DefaultStateTtlMs;
  }

  private now(): number {
    return this.config.clock?.() ?? Date.now();
  }

  // eslint-disable-next-line sonarjs/function-return-type
  private validateReturnUrl(
    value: string | null | undefined,
  ): string | undefined | AuthOAuthError {
    if (value === null || value === undefined || value.trim() === "") {
      return undefined;
    }

    const normalized = normalizeReturnUrl(value);
    const allowed = (this.config.allowedReturnUrls ?? [])
      .map(normalizeReturnUrl)
      .filter((url): url is string => Boolean(url));

    if (!normalized || !allowed.includes(normalized)) {
      return {
        code: "invalid_request",
        message: "OAuth return URL is not allowlisted.",
      };
    }

    return normalized;
  }
}

function normalizeSessionId(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeState(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeReturnUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    if (trimmed.startsWith("/")) {
      if (trimmed.startsWith("//")) {
        return undefined;
      }
      const url = new URL(trimmed, PlaceholderOrigin);
      return `${url.pathname}${url.search}${url.hash}`;
    }

    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

function hashOAuthValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isAuthOAuthError(
  value: AuthOAuthError | AuthOAuthStoredState | string | undefined,
): value is AuthOAuthError {
  return Boolean(
    value && typeof value === "object" && "code" in value && "message" in value,
  );
}
