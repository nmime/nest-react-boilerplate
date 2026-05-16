import { spawn } from "node:child_process";

export const composeArgs = ["compose", "-f", "docker/docker-compose.yml"];
export const stackServices = [
  "migrate",
  "backend-admin-app-api",
  "user-app-api",
  "auth-app-api",
  "admin-app",
  "user-app",
  "landing-app",
];

export const composeEnv = {
  ...process.env,
  COMPOSE_PARALLEL_LIMIT: process.env.COMPOSE_PARALLEL_LIMIT ?? "1",
  COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? "false",
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1",
  NX_DAEMON: "false",
  NX_PARALLEL: process.env.NX_PARALLEL ?? "1",
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

export async function buildStackImages(): Promise<void> {
  for (const service of stackServices) {
    await run("docker", [...composeArgs, "build", service]);
  }
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
