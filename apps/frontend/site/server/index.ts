import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderPage } from "vike/server";

const appRoot = resolve(import.meta.dirname, "..");
const workspaceDistRoot = resolve(appRoot, "../../../dist/apps/frontend/site");
const siteRoot = resolve(process.env.SITE_DIST_ROOT ?? workspaceDistRoot);
const clientAssetsRoot = join(siteRoot, "client");
const serverEntryPath = join(siteRoot, "server/entry.mjs");

function isContainerEnvironment(): boolean {
  const container = process.env.CONTAINER?.trim().toLowerCase();
  const hasContainerMarker =
    container !== undefined &&
    container !== "" &&
    !["0", "false", "no", "off"].includes(container);

  return Boolean(process.env.KUBERNETES_SERVICE_HOST) || hasContainerMarker;
}

function readPort(name: string, value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== trimmed || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (parsed > 65_535) {
    throw new Error(`${name} must be between 1 and 65535.`);
  }

  return parsed;
}

const port =
  readPort("SITE_APP_PORT", process.env.SITE_APP_PORT) ??
  readPort("PORT", process.env.PORT) ??
  (isContainerEnvironment() ? 80 : 4203);

if (process.env.NODE_ENV === "production") {
  if (!existsSync(serverEntryPath)) {
    throw new Error(`Missing Vike production server entry: ${serverEntryPath}`);
  }

  await import(pathToFileURL(serverEntryPath).href);
}

const app = fastify({
  logger: process.env.NODE_ENV !== "test",
});

if (existsSync(clientAssetsRoot)) {
  await app.register(fastifyStatic, {
    root: clientAssetsRoot,
    wildcard: false,
  });
}

const healthPayload = { status: "ok", service: "site-app" } as const;

app.get("/health", () => healthPayload);
app.get("/live", () => healthPayload);
app.get("/ready", () => healthPayload);

app.get("/*", async (request, reply) => {
  const pageContext = await renderPage({
    headersOriginal: request.headers,
    urlOriginal: request.raw.url ?? "/",
  });
  // Vike types `httpResponse` as always present, but it is `null` for requests
  // Vike does not render (e.g. asset paths without a matching route), so keep
  // the fallback guard and reflect the real nullability here.
  const httpResponse = pageContext.httpResponse as
    typeof pageContext.httpResponse | null;

  if (!httpResponse) {
    return reply.code(404).send("Not found");
  }

  httpResponse.headers.forEach(([name, value]) => {
    reply.header(name, value);
  });

  return reply.code(httpResponse.statusCode).send(httpResponse.body);
});

await app.listen({ host: "0.0.0.0", port });
