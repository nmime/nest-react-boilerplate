import { composeArgs, run } from "./compose";

export default async function globalTeardown(): Promise<void> {
  await run("docker", [
    ...composeArgs,
    "down",
    "--volumes",
    "--remove-orphans",
  ]);
}
