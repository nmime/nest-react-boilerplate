import { existsSync } from "node:fs";

export function isRunningInContainer(): boolean {
  return Boolean(
    process.env.KUBERNETES_SERVICE_HOST ||
    process.env.CONTAINER ||
    existsSync("/.dockerenv"),
  );
}
