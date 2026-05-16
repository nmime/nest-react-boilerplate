import { spawn } from "node:child_process";

export const composeArgs = ["compose", "-f", "docker/docker-compose.yml"];

export const composeEnv = {
  ...process.env,
  AUTH_JWT_SECRET:
    process.env.AUTH_JWT_SECRET ?? "fullstack-e2e-jwt-secret-change-me",
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER ?? "nest-react-boilerplate",
  AUTH_JWT_AUDIENCE:
    process.env.AUTH_JWT_AUDIENCE ?? "nest-react-boilerplate-api",
  ADMIN_BOOTSTRAP_EMAILS:
    process.env.ADMIN_BOOTSTRAP_EMAILS ?? "admin@example.com",
};

export const urls = {
  adminApi: "http://127.0.0.1:3001",
  userApi: "http://127.0.0.1:3002",
  authApi: "http://127.0.0.1:3003",
  adminApp: "http://127.0.0.1:8081",
  userApp: "http://127.0.0.1:8082",
  landingApp: "http://127.0.0.1:8083",
};

export function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: composeEnv });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

export async function waitForText(
  label: string,
  url: string,
  contains: string,
): Promise<void> {
  const started = Date.now();
  let lastError = "not attempted";
  while (Date.now() - started < 180_000) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (text.includes(contains)) {
        console.log(`${label}: ok (${response.status})`);
        return;
      }
      lastError = `${response.status} missing expected text`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`${label} did not become ready: ${lastError}`);
}
