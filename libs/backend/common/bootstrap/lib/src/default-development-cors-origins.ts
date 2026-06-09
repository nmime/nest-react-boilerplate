const DefaultDevelopmentCorsOrigins = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "http://localhost:4201",
  "http://127.0.0.1:4201",
  "http://localhost:4202",
  "http://127.0.0.1:4202",
] as const;

export function resolveDefaultDevelopmentCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
  if (
    env.NODE_ENV === "production" ||
    env.CORS_ORIGINS?.trim() ||
    env.CORS_ORIGIN?.trim()
  ) {
    return undefined;
  }

  return [...DefaultDevelopmentCorsOrigins];
}
