import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderPage } from "vike/server";

const siteRoot = resolve(import.meta.dirname, "..");
const clientAssetsRoot = join(siteRoot, "client");
const port = Number(process.env.PORT ?? 4203);

const app = fastify({
  logger: process.env.NODE_ENV !== "test",
});

if (existsSync(clientAssetsRoot)) {
  await app.register(fastifyStatic, {
    root: clientAssetsRoot,
    wildcard: false,
  });
}

app.get("/*", async (request, reply) => {
  const pageContext = await renderPage({
    headersOriginal: request.headers,
    urlOriginal: request.raw.url ?? "/",
  });
  const { httpResponse } = pageContext;

  if (!httpResponse) {
    return reply.code(404).send("Not found");
  }

  httpResponse.headers.forEach(([name, value]) => {
    reply.header(name, value);
  });

  return reply.code(httpResponse.statusCode).send(httpResponse.body);
});

await app.listen({ host: "0.0.0.0", port });
