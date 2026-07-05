// Lib-private helper barrel. Intentionally NOT re-exported from the top-level
// src/index.ts: these are DiscordInteractionRouter response-building and
// error-mapping implementation details and must stay out of the public
// @app/backend-bots-discord API. Consumers within the lib import from "../util".
export * from "./discord-interaction-router.util";
