/**
 * Port utilities for explicit service port configuration.
 *
 * Every runnable service MUST have an explicitly assigned port.
 * There is no runtime auto-discovery, no implicit framework/default
 * port fallback, and no random free-port allocation.
 */

/**
 * Derive the environment variable name for a given application name.
 *
 * Example: "admin-app-api" -> "ADMIN_APP_API_PORT"
 */
export function getPortEnvVarName(appName: string): string {
  const segments = appName
    .trim()
    .toUpperCase()
    .split('')
    .map((char) => (/[A-Z0-9]/u.test(char) ? char : '_'))
    .join('')
    .split('_')
    .filter(Boolean);

  return `${segments.join('_')}_PORT`;
}
