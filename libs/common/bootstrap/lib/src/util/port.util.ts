import { createServer } from "node:net";
import { isRunningInContainer } from "./container.util";

export async function findFreePort(from = 3000): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve(findFreePort(from + 1));
      } else {
        reject(error);
      }
    });
    server.listen(from, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : from;
      server.close(() => resolve(port));
    });
  });
}

export async function defaultPortFactory(): Promise<number> {
  return isRunningInContainer() ? 80 : await findFreePort(3000);
}

export function getPortEnvVarName(appName: string): string {
  const segments = appName
    .trim()
    .toUpperCase()
    .split("")
    .map((char) => (/[A-Z0-9]/u.test(char) ? char : "_"))
    .join("")
    .split("_")
    .filter(Boolean);

  return `${segments.join("_")}_PORT`;
}
