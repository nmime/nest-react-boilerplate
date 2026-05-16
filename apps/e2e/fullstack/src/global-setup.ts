import {
  buildStackImages,
  composeArgs,
  run,
  urls,
  waitForText,
} from "./compose";

export default async function globalSetup(): Promise<void> {
  await run("docker", [
    ...composeArgs,
    "down",
    "--volumes",
    "--remove-orphans",
  ]);
  await buildStackImages();
  await run("docker", [...composeArgs, "up", "--no-build", "-d"]);
  await waitForText("auth api", `${urls.authApi}/health`, "auth-app-api");
  await waitForText("user api", `${urls.userApi}/health`, "user-app-api");
  await waitForText(
    "admin api",
    `${urls.adminApi}/health`,
    "backend-admin-app-api",
  );
  await waitForText("user app", `${urls.userApp}/`, "User App");
  await waitForText("admin app", `${urls.adminApp}/`, "Admin App");
  await waitForText(
    "landing app",
    `${urls.landingApp}/`,
    "Nest React Boilerplate",
  );
}
