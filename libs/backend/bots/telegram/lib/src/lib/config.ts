import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramBotConfig } from "./types";

const DefaultSessionTtlSeconds = 60 * 60 * 24 * 14;
const DefaultRateLimitTimeFrameMs = 1_000;
const DefaultRateLimit = 3;

export function resolveTelegramBotConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramBotConfig {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  const nodeEnv = env.NODE_ENV === "production" ? "production" : "development";
  const environment = env.VITEST ? "test" : nodeEnv;
  const mode = resolveMode(env, environment);

  return {
    token,
    appUrl: resolveSafeTelegramAppUrl(env),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim(),
    mode,
    environment,
    sessionTtlSeconds: readPositiveInt(
      env.TELEGRAM_BOT_SESSION_TTL_SECONDS,
      DefaultSessionTtlSeconds,
    ),
    rateLimit: {
      timeFrameMs: readPositiveInt(
        env.TELEGRAM_BOT_RATE_LIMIT_WINDOW_MS,
        DefaultRateLimitTimeFrameMs,
      ),
      limit: readPositiveInt(env.TELEGRAM_BOT_RATE_LIMIT, DefaultRateLimit),
    },
  };
}

export function resolveSafeTelegramAppUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of [
    "TELEGRAM_WEB_APP_URL",
    "TELEGRAM_TMA_URL",
    "TMA_URL",
    "FRONTEND_URL",
  ]) {
    const value = env[key]?.trim();
    if (value && isSafeTelegramAppUrl(value)) {
      return value;
    }
  }

  return undefined;
}

export function isSafeTelegramAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return false;
    }

    const host = url.hostname.toLowerCase();
    if (!host || host.startsWith("telegram-bot.") || host.includes(".api.")) {
      return false;
    }

    const pathname = normalizePathname(url.pathname);
    return pathname !== "/" && pathname !== "/telegram/webhook";
  } catch {
    return false;
  }
}

export function resolveMode(
  env: NodeJS.ProcessEnv,
  environment: TelegramBotConfig["environment"],
): TelegramBotConfig["mode"] {
  const explicit = env.TELEGRAM_BOT_MODE?.trim().toLowerCase();
  if (explicit === "webhook" || explicit === "polling") {
    return explicit;
  }

  return environment === "production" ? "webhook" : "polling";
}

export function assertWebhookRuntimeAllowed(
  config: Pick<TelegramBotConfig, "mode">,
): void {
  if (config.mode === "polling") {
    throw new Error(
      "Telegram webhook runtime cannot start when TELEGRAM_BOT_MODE=polling.",
    );
  }
}

export function assertPollingRuntimeAllowed(
  config: Pick<TelegramBotConfig, "mode" | "environment">,
): void {
  if (config.mode === "webhook") {
    throw new Error(
      "Telegram polling runtime cannot start when TELEGRAM_BOT_MODE=webhook.",
    );
  }

  if (config.environment === "production") {
    throw new Error("Telegram polling runtime is disabled in production.");
  }
}

export function verifyWebhookSecret(input: {
  configuredSecret?: string | null;
  header?: string | string[] | null;
}): boolean {
  const configuredSecret = input.configuredSecret?.trim();
  if (!configuredSecret) {
    return false;
  }

  const header = Array.isArray(input.header) ? input.header[0] : input.header;
  if (!header) {
    return false;
  }

  const left = Buffer.from(header);
  const right = Buffer.from(configuredSecret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signStartPayload(
  value: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): string {
  const data = Buffer.from(`${now}.${value}`).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function verifyStartPayload(
  payload: string,
  secret: string,
  maxAgeSeconds = 600,
  now = Math.floor(Date.now() / 1000),
): string | null {
  const [data, signature] = payload.split(".");
  if (!data || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  const decoded = Buffer.from(data, "base64url").toString("utf8");
  const separator = decoded.indexOf(".");
  const issuedAt = Number.parseInt(decoded.slice(0, separator), 10);
  if (!Number.isFinite(issuedAt) || now - issuedAt > maxAgeSeconds) {
    return null;
  }

  return decoded.slice(separator + 1);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePathname(pathname: string): string {
  return pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1).toLowerCase()
    : pathname.toLowerCase();
}
