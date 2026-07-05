import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
export function run(command: string, args: string[], options: SpawnOptions = {}): Promise<void> { return new Promise<void>((resolve, reject) => { const child = spawn(command, args, options); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))); }); }
export async function hasDockerRuntime(): Promise<boolean> { if (process.env.SKIP_DOCKER_TESTS === "true") return false; if (process.env.CI === "true") return true; try { await run("docker", ["version"], { stdio: "ignore" }); return true; } catch { return false; } }
export async function skipWhenDockerUnavailable(label: string): Promise<boolean> { if (await hasDockerRuntime()) return false; console.warn(`${label}: skipped because Docker is not available on this host.`); return true; }
