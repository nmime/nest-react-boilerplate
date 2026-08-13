/** Port keys the smoke stack generates, one per published service. */
export type SmokePortName =
  | "adminApi"
  | "adminApp"
  | "authApi"
  | "landingApp"
  | "mobileApp"
  | "siteApp"
  | "userApi"
  | "userApp";

export interface SmokeProbe {
  name: string;
  port: SmokePortName;
  path: string;
  /**
   * Text the response body must contain. Structural only -- never page copy: the shipped titles
   * are rewritten from VITE_PRODUCT_NAME at build time and the rendered headings come from i18n
   * catalogs, so a marker taken from either one asserts that nobody has rebranded the product.
   */
  marker: string;
  status: number;
  /** Backends are probed before the frontends they serve are even started. */
  tier: "backend" | "frontend";
}

export const smokeProbes: readonly SmokeProbe[] = [
  { name: "auth health", port: "authApi", path: "/health", marker: "auth-app-api", status: 200, tier: "backend" },
  { name: "user health", port: "userApi", path: "/health", marker: "user-app-api", status: 200, tier: "backend" },
  { name: "admin health", port: "adminApi", path: "/health", marker: "admin-app-api", status: 200, tier: "backend" },
  {
    name: "admin frontend",
    port: "adminApp",
    path: "/",
    marker: 'data-app="admin-app"',
    status: 200,
    tier: "frontend",
  },
  { name: "user frontend", port: "userApp", path: "/", marker: 'data-app="user-app"', status: 200, tier: "frontend" },
  {
    // The SPA fallback has to serve the same document for a client route as it does for `/`.
    name: "user auth frontend",
    port: "userApp",
    path: "/auth",
    marker: 'data-app="user-app"',
    status: 200,
    tier: "frontend",
  },
  {
    name: "landing frontend",
    port: "landingApp",
    path: "/",
    marker: 'data-app="landing-app"',
    status: 200,
    tier: "frontend",
  },
  {
    // Vike renders the document server-side and answers a readiness route with its own service
    // name, which is the only text on this app that a product never rewrites.
    name: "site frontend",
    port: "siteApp",
    path: "/ready",
    marker: "site-app",
    status: 200,
    tier: "frontend",
  },
  {
    // Expo owns this document; there is no markup of ours to carry a `data-app` attribute, so the
    // marker is the export layout itself -- present for every Expo web build, absent for anything
    // else that could end up answering on this port.
    name: "mobile frontend",
    port: "mobileApp",
    path: "/",
    marker: "/_expo/static/js/web/",
    status: 200,
    tier: "frontend",
  },
  {
    name: "user proxy auth",
    port: "userApp",
    path: "/auth/me",
    marker: '"type":"about:blank"',
    status: 401,
    tier: "frontend",
  },
  {
    name: "admin proxy",
    port: "adminApp",
    path: "/admin/profile/me",
    marker: '"type":"about:blank"',
    status: 401,
    tier: "frontend",
  },
];
