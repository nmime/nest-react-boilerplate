/**
 * Product image compile is opt-in.
 *
 * Deploy, Compose up, and merge CI start stacks with `--no-build`. Bake runs
 * only when a release, nightly lane, or an explicit local compile asks for it.
 */
export function imageCompileRequested(env = process.env) {
  const value = env.NRB_IMAGE_COMPILE?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}
