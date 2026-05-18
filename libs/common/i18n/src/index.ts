export const translations = {
  en: {
    "common.language": "Language",
    "common.language.en": "English",
    "common.language.es": "Spanish",
    "common.loading": "Loading...",
    "common.ready": "Ready",
    "common.status.ready": "Ready",
    "common.status.secure": "Secure",
    "common.homeLink": "{{appName}} home",
    "ui.errorBoundary.title": "Something went wrong",
    "ui.errorBoundary.description":
      "Try refreshing the page. If the issue continues, contact support with the request id from the API response.",
    "landing.appName": "Landing App",
    "landing.eyebrow": "Nest + React boilerplate",
    "landing.title": "Launch a full-stack Nest and React product foundation.",
    "landing.description":
      "Production-ready defaults for APIs, frontends, testing, and deployment.",
    "landing.action.user": "Open user app",
    "landing.action.admin": "Open admin app",
    "landing.action.docs": "API docs",
    "landing.productName": "Nest React Boilerplate",
    "landing.section.title": "What is included",
    "landing.section.eyebrow": "Workspace",
    "landing.card.api": "Nest APIs",
    "landing.card.api.description":
      "auth-app-api, user-app-api, and admin-app-api.",
    "landing.card.frontend": "React apps",
    "landing.card.frontend.description":
      "landing, user, and admin React surfaces share one i18n provider.",
    "landing.card.ops": "Deployment-ready ops",
    "landing.card.ops.description":
      "Docker, health checks, OpenAPI, and deployment defaults stay wired.",
    "landing.stat.apis": "APIs",
    "landing.stat.apis.detail": "auth, user, admin",
    "landing.stat.apps": "Apps",
    "landing.stat.apps.detail": "landing, user, admin",
    "landing.stat.libs": "Shared libraries",
    "admin.appName": "Admin App",
    "admin.eyebrow": "Admin console",
    "admin.title":
      "Operate the product platform with a fail-closed admin experience.",
    "admin.description":
      "Inspect protected admin data and exercise role-based access controls.",
    "admin.status": "RBAC protected",
    "admin.action.dashboard": "Dashboard",
    "admin.action.profile": "Profile",
    "admin.dashboard.title": "Admin dashboard",
    "admin.dashboard.description": "Your administrative access is active.",
    "admin.dashboard.eyebrow": "Dashboard",
    "admin.dashboard.card.visibility.title": "Operational visibility",
    "admin.dashboard.card.visibility.description":
      "Review protected admin resources through TanStack Query and the shared API client.",
    "admin.dashboard.card.rbac.title": "Fail-closed RBAC",
    "admin.dashboard.card.rbac.description":
      "Dashboard access is granted only when the bearer token carries the admin role and dashboard permission.",
    "admin.dashboard.card.access.title": "Current access",
    "admin.dashboard.accessSummary":
      "Roles: {{roles}}. Permissions: {{permissions}}.",
    "admin.dashboard.access.none": "none",
    "admin.dashboard.stat.profile.label": "Profile",
    "admin.dashboard.stat.profile.detail": "Fetched from /admin/profile/me",
    "admin.dashboard.stat.pages.label": "Pages",
    "admin.dashboard.stat.pages.detail": "Admin shell routes",
    "admin.profile.title": "Admin profile",
    "admin.profile.eyebrow": "Profile",
    "admin.profile.fallbackDisplayName": "Administrator",
    "admin.profile.unknown": "unknown",
    "admin.profile.emailLine": "Email: {{value}}",
    "admin.profile.subjectLine": "Subject: {{value}}",
    "admin.forbidden.title": "RBAC denied",
    "admin.forbidden.eyebrow": "Forbidden",
    "admin.forbidden.accessDeniedTitle": "Access denied",
    "admin.notFound.title": "Unknown route",
    "admin.notFound.eyebrow": "Not found",
    "admin.notFound.sectionTitle": "Admin page not found",
    "admin.notFound.description": "Choose dashboard or profile.",
    "admin.form.bearerToken": "Bearer token",
    "admin.form.saveToken": "Save token",
    "admin.form.devTokenAriaLabel": "Development bearer token",
    "admin.form.tokenPlaceholder": "Paste development token",
    "admin.state.missingToken":
      "Provide a bearer token via query parameter, localStorage, or the development form.",
    "admin.permission.dashboardMissing": "Missing admin dashboard permission.",
    "admin.permission.profileMissing": "Missing admin profile permission.",
    "admin.loadingProfile": "Loading admin profile...",
    "admin.loadingEyebrow": "Loading",
    "admin.error.profileRequestFailed": "Profile request failed.",
    "user.appName": "User App",
    "user.eyebrow": "User workspace",
    "user.title": "Sign in, register, and load your protected profile.",
    "user.description":
      "Connect the React user app to the auth and user APIs using bearer authentication.",
    "user.status": "Auth ready",
    "user.action.profile": "Profile",
    "user.auth.eyebrow": "Authentication",
    "user.auth.title": "Development login/register flow",
    "user.login.title": "Login",
    "user.register.title": "Register",
    "user.profile.title": "Profile state",
    "user.form.email": "Email",
    "user.form.password": "Password",
    "user.form.displayName": "Display name",
    "user.form.login": "Login",
    "user.form.register": "Register",
    "user.form.loginEmailLabel": "Login email",
    "user.form.loginPasswordLabel": "Login password",
    "user.form.registerDisplayNameLabel": "Register display name",
    "user.form.registerEmailLabel": "Register email",
    "user.form.registerPasswordLabel": "Register password",
    "user.form.emailPlaceholder": "user@example.com",
    "user.form.loginPasswordPlaceholder": "password",
    "user.form.registerEmailPlaceholder": "new@example.com",
    "user.form.registerPasswordPlaceholder": "minimum 8 characters",
    "user.stat.authApi.label": "Auth API",
    "user.stat.authApi.detail": "auth-app-api",
    "user.stat.userApi.label": "User API",
    "user.stat.userApi.detail": "user-app-api",
    "user.error.profileRequestFailed": "Profile request failed.",
    "user.error.authenticationFailed": "Authentication failed.",
    "user.state.missingToken": "Provide a token or use login/register.",
    "user.state.ready": "Ready: {{subject}}",
    "user.state.forbidden": "Forbidden: {{reason}}",
    "user.loadingProfile": "Loading profile...",
    "user.profile.unknown": "unknown",
    "errors.bad-request.title": "Bad Request",
    "errors.bad-request.detail": "The request could not be processed.",
    "errors.conflict.title": "Conflict",
    "errors.conflict.detail": "The request conflicts with current state.",
    "errors.forbidden.title": "Forbidden",
    "errors.forbidden.detail": "You do not have access to this resource.",
    "errors.not-found.title": "Not Found",
    "errors.not-found.detail": "The requested resource was not found.",
    "errors.unauthorized.title": "Unauthorized",
    "errors.unauthorized.detail": "Authentication is required.",
    "errors.internal-server-error.title": "Internal Server Error",
    "errors.internal-server-error.detail": "An unexpected error occurred.",
    "errors.too-many-requests.title": "Too Many Requests",
    "errors.rate-limited.title": "Too Many Requests",
    "errors.rate-limited.detail": "Too many requests.",
    "errors.validation-error.title": "Validation failed",
    "errors.validation-error.detail": "Request validation failed.",
    "errors.api.requestFailed": "Request failed with {{status}}.",
    "errors.auth.jwtSecretMissing":
      "Authentication signing secret is not configured.",
    "errors.auth.missingBearer": "Missing bearer token.",
    "errors.auth.malformedJwt": "Malformed JWT.",
    "errors.auth.malformedJwtPart": "Malformed {{part}}.",
    "errors.auth.algNone": "JWT alg none is not allowed.",
    "errors.auth.unsupportedAlgorithm": "Unsupported JWT algorithm.",
    "errors.auth.invalidSignature": "Invalid JWT signature.",
    "errors.auth.expired": "JWT is expired.",
    "errors.auth.notActive": "JWT is not active yet.",
    "errors.auth.issuerMismatch": "JWT issuer mismatch.",
    "errors.auth.audienceMismatch": "JWT audience mismatch.",
    "errors.auth.subjectRequired": "JWT subject is required.",
    "errors.auth.invalidCredentials": "Invalid email or password.",
    "errors.auth.userInactive": "User is not active.",
    "errors.auth.principalMissing": "Authenticated principal is missing.",
    "errors.auth.emailRegistered": "Email is already registered.",
    "errors.rbac.roleMissing": "Required role is missing.",
    "errors.rbac.permissionMissing": "Required permission is missing.",
    "validation.constraints.isEmail": "{{property}} must be an email address",
    "validation.constraints.isString": "{{property}} must be a string",
    "validation.constraints.minLength": "{{property}} is too short",
    "validation.constraints.isOptional": "{{property}} is optional",
  },
  es: {
    "common.language": "Idioma",
    "common.language.en": "Inglés",
    "common.language.es": "Español",
    "common.loading": "Cargando...",
    "common.ready": "Listo",
    "common.status.ready": "Listo",
    "common.status.secure": "Seguro",
    "common.homeLink": "Inicio de {{appName}}",
    "ui.errorBoundary.title": "Algo salió mal",
    "ui.errorBoundary.description":
      "Intenta actualizar la página. Si el problema continúa, contacta a soporte con el id de solicitud de la respuesta de la API.",
    "landing.appName": "App de inicio",
    "landing.eyebrow": "Boilerplate Nest + React",
    "landing.title": "Lanza una base full-stack con Nest y React.",
    "landing.description":
      "Valores listos para producción para APIs, frontends, pruebas y despliegue.",
    "landing.action.user": "Abrir app de usuario",
    "landing.action.admin": "Abrir app de admin",
    "landing.action.docs": "Docs de API",
    "landing.productName": "Nest React Boilerplate",
    "landing.section.title": "Qué incluye",
    "landing.section.eyebrow": "Workspace",
    "landing.card.api": "APIs Nest",
    "landing.card.api.description":
      "auth-app-api, user-app-api y admin-app-api.",
    "landing.card.frontend": "Apps React",
    "landing.card.frontend.description":
      "Las superficies React de landing, usuario y admin comparten un proveedor i18n.",
    "landing.card.ops": "Operaciones listas para desplegar",
    "landing.card.ops.description":
      "Docker, health checks, OpenAPI y valores de despliegue siguen conectados.",
    "landing.stat.apis": "APIs",
    "landing.stat.apis.detail": "auth, user, admin",
    "landing.stat.apps": "Apps",
    "landing.stat.apps.detail": "landing, user, admin",
    "landing.stat.libs": "Librerías compartidas",
    "admin.appName": "App de admin",
    "admin.eyebrow": "Consola de administración",
    "admin.title": "Opera la plataforma con una experiencia admin segura.",
    "admin.description":
      "Inspecciona datos protegidos de admin y controles de acceso por rol.",
    "admin.status": "Protegido por RBAC",
    "admin.action.dashboard": "Panel",
    "admin.action.profile": "Perfil",
    "admin.dashboard.title": "Panel de admin",
    "admin.dashboard.description": "Tu acceso administrativo está activo.",
    "admin.dashboard.eyebrow": "Panel",
    "admin.dashboard.card.visibility.title": "Visibilidad operativa",
    "admin.dashboard.card.visibility.description":
      "Revisa recursos protegidos de admin con TanStack Query y el cliente API compartido.",
    "admin.dashboard.card.rbac.title": "RBAC seguro",
    "admin.dashboard.card.rbac.description":
      "El acceso al panel se concede solo cuando el token bearer incluye el rol admin y el permiso del panel.",
    "admin.dashboard.card.access.title": "Acceso actual",
    "admin.dashboard.accessSummary":
      "Roles: {{roles}}. Permisos: {{permissions}}.",
    "admin.dashboard.access.none": "ninguno",
    "admin.dashboard.stat.profile.label": "Perfil",
    "admin.dashboard.stat.profile.detail": "Obtenido desde /admin/profile/me",
    "admin.dashboard.stat.pages.label": "Páginas",
    "admin.dashboard.stat.pages.detail": "Rutas del shell admin",
    "admin.profile.title": "Perfil de admin",
    "admin.profile.eyebrow": "Perfil",
    "admin.profile.fallbackDisplayName": "Administrador",
    "admin.profile.unknown": "desconocido",
    "admin.profile.emailLine": "Email: {{value}}",
    "admin.profile.subjectLine": "Sujeto: {{value}}",
    "admin.forbidden.title": "RBAC denegado",
    "admin.forbidden.eyebrow": "Prohibido",
    "admin.forbidden.accessDeniedTitle": "Acceso denegado",
    "admin.notFound.title": "Ruta desconocida",
    "admin.notFound.eyebrow": "No encontrado",
    "admin.notFound.sectionTitle": "Página admin no encontrada",
    "admin.notFound.description": "Elige panel o perfil.",
    "admin.form.bearerToken": "Token bearer",
    "admin.form.saveToken": "Guardar token",
    "admin.form.devTokenAriaLabel": "Token bearer de desarrollo",
    "admin.form.tokenPlaceholder": "Pega el token de desarrollo",
    "admin.state.missingToken":
      "Proporciona un token bearer por parámetro de consulta, localStorage o el formulario de desarrollo.",
    "admin.permission.dashboardMissing": "Falta el permiso del panel de admin.",
    "admin.permission.profileMissing": "Falta el permiso del perfil de admin.",
    "admin.loadingProfile": "Cargando perfil de admin...",
    "admin.loadingEyebrow": "Cargando",
    "admin.error.profileRequestFailed": "La solicitud del perfil falló.",
    "user.appName": "App de usuario",
    "user.eyebrow": "Espacio de usuario",
    "user.title": "Inicia sesión, regístrate y carga tu perfil protegido.",
    "user.description":
      "Conecta la app React de usuario a las APIs de auth y usuario con autenticación bearer.",
    "user.status": "Auth listo",
    "user.action.profile": "Perfil",
    "user.auth.eyebrow": "Autenticación",
    "user.auth.title": "Flujo de desarrollo de login/registro",
    "user.login.title": "Iniciar sesión",
    "user.register.title": "Registro",
    "user.profile.title": "Estado del perfil",
    "user.form.email": "Email",
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- Translation text, not a credential.
    "user.form.password": "Contraseña",
    "user.form.displayName": "Nombre visible",
    "user.form.login": "Entrar",
    "user.form.register": "Registrarse",
    "user.form.loginEmailLabel": "Email de login",
    "user.form.loginPasswordLabel": "Contraseña de login",
    "user.form.registerDisplayNameLabel": "Nombre visible de registro",
    "user.form.registerEmailLabel": "Email de registro",
    "user.form.registerPasswordLabel": "Contraseña de registro",
    "user.form.emailPlaceholder": "usuario@example.com",
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- Translation text, not a credential.
    "user.form.loginPasswordPlaceholder": "contraseña",
    "user.form.registerEmailPlaceholder": "nuevo@example.com",
    "user.form.registerPasswordPlaceholder": "mínimo 8 caracteres",
    "user.stat.authApi.label": "API de auth",
    "user.stat.authApi.detail": "auth-app-api",
    "user.stat.userApi.label": "API de usuario",
    "user.stat.userApi.detail": "user-app-api",
    "user.error.profileRequestFailed": "La solicitud del perfil falló.",
    "user.error.authenticationFailed": "La autenticación falló.",
    "user.state.missingToken": "Proporciona un token o usa login/registro.",
    "user.state.ready": "Listo: {{subject}}",
    "user.state.forbidden": "Prohibido: {{reason}}",
    "user.loadingProfile": "Cargando perfil...",
    "user.profile.unknown": "desconocido",
    "errors.bad-request.title": "Solicitud incorrecta",
    "errors.bad-request.detail": "La solicitud no pudo procesarse.",
    "errors.conflict.title": "Conflicto",
    "errors.conflict.detail":
      "La solicitud entra en conflicto con el estado actual.",
    "errors.forbidden.title": "Prohibido",
    "errors.forbidden.detail": "No tienes acceso a este recurso.",
    "errors.not-found.title": "No encontrado",
    "errors.not-found.detail": "No se encontró el recurso solicitado.",
    "errors.unauthorized.title": "No autorizado",
    "errors.unauthorized.detail": "Se requiere autenticación.",
    "errors.internal-server-error.title": "Error interno del servidor",
    "errors.internal-server-error.detail": "Ocurrió un error inesperado.",
    "errors.too-many-requests.title": "Demasiadas solicitudes",
    "errors.rate-limited.title": "Demasiadas solicitudes",
    "errors.rate-limited.detail": "Demasiadas solicitudes.",
    "errors.validation-error.title": "La validación falló",
    "errors.validation-error.detail": "La validación de la solicitud falló.",
    "errors.api.requestFailed": "La solicitud falló con {{status}}.",
    "errors.auth.jwtSecretMissing":
      "El secreto de firma de autenticación no está configurado.",
    "errors.auth.missingBearer": "Falta el token bearer.",
    "errors.auth.malformedJwt": "JWT mal formado.",
    "errors.auth.malformedJwtPart": "{{part}} mal formado.",
    "errors.auth.algNone": "El algoritmo none de JWT no está permitido.",
    "errors.auth.unsupportedAlgorithm": "Algoritmo JWT no soportado.",
    "errors.auth.invalidSignature": "Firma JWT inválida.",
    "errors.auth.expired": "El JWT expiró.",
    "errors.auth.notActive": "El JWT aún no está activo.",
    "errors.auth.issuerMismatch": "El issuer del JWT no coincide.",
    "errors.auth.audienceMismatch": "La audiencia del JWT no coincide.",
    "errors.auth.subjectRequired": "El subject del JWT es obligatorio.",
    "errors.auth.invalidCredentials": "Email o contraseña inválidos.",
    "errors.auth.userInactive": "El usuario no está activo.",
    "errors.auth.principalMissing": "Falta el principal autenticado.",
    "errors.auth.emailRegistered": "El email ya está registrado.",
    "errors.rbac.roleMissing": "Falta el rol requerido.",
    "errors.rbac.permissionMissing": "Falta el permiso requerido.",
    "validation.constraints.isEmail": "{{property}} debe ser un email válido",
    "validation.constraints.isString": "{{property}} debe ser texto",
    "validation.constraints.minLength": "{{property}} es demasiado corto",
    "validation.constraints.isOptional": "{{property}} es opcional",
  },
} as const;

export type Locale = keyof typeof translations;
export type TranslationKey = keyof (typeof translations)["en"];
export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const fallbackLocale: Locale = "en";
export const supportedLocales = Object.keys(translations) as Locale[];

export interface TranslateOptions {
  locale?: string | null;
  params?: TranslationParams;
}

export interface LocaleRequestSource {
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, unknown>;
  language?: string;
  locale?: string;
  url?: string;
  originalUrl?: string;
}

const supportedLocaleSet = new Set<string>(supportedLocales);

export function normalizeLocale(
  value: string | null | undefined,
): Locale | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (!normalized) {
    return undefined;
  }

  const candidates = [normalized, normalized.split("-")[0]];
  return candidates.find((candidate): candidate is Locale =>
    supportedLocaleSet.has(candidate),
  );
}

export function parseAcceptLanguage(
  value: string | null | undefined,
): Locale | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((part) => {
      const [localePart, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      return {
        locale: normalizeLocale(localePart),
        quality: quality ? Number.parseFloat(quality.slice(2)) : 1,
      };
    })
    .filter(
      (entry): entry is { locale: Locale; quality: number } =>
        Boolean(entry.locale) &&
        Number.isFinite(entry.quality) &&
        entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality)[0]?.locale;
}

export function resolveLocale(
  ...values: Array<string | null | undefined>
): Locale {
  for (const value of values) {
    const locale = normalizeLocale(value) ?? parseAcceptLanguage(value);
    if (locale) {
      return locale;
    }
  }

  return fallbackLocale;
}

function firstHeader(
  headers: LocaleRequestSource["headers"],
  name: string,
): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  return typeof value === "string" ? value : undefined;
}

function localeFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "http://localhost");
    return (
      parsed.searchParams.get("lang") ??
      parsed.searchParams.get("locale") ??
      undefined
    );
  } catch {
    return undefined;
  }
}

function firstCookieValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
  return resolveLocale(
    firstQueryValue(source.query?.lang),
    firstQueryValue(source.query?.locale),
    localeFromUrl(source.originalUrl ?? source.url),
    firstHeader(source.headers, "x-locale"),
    firstHeader(source.headers, "x-language"),
    firstCookieValue(source.cookies?.locale),
    firstCookieValue(source.cookies?.lang),
    source.locale,
    source.language,
    firstHeader(source.headers, "accept-language"),
  );
}

export function hasTranslationKey(key: string): key is TranslationKey {
  return key in translations[fallbackLocale];
}

export function interpolate(
  message: string,
  params: TranslationParams = {},
): string {
  return message.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translate(
  key: TranslationKey,
  { locale = fallbackLocale, params = {} }: TranslateOptions = {},
): string {
  const resolvedLocale = normalizeLocale(locale) ?? fallbackLocale;
  const message =
    translations[resolvedLocale][key] ?? translations[fallbackLocale][key];
  return interpolate(message, params);
}

export class I18nService {
  readonly fallbackLocale = fallbackLocale;
  readonly supportedLocales = supportedLocales;

  translate(key: TranslationKey, options: TranslateOptions = {}): string {
    return translate(key, options);
  }

  resolveLocale(...values: Array<string | null | undefined>): Locale {
    return resolveLocale(...values);
  }

  resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
    return resolveLocaleFromRequest(source);
  }
}

export function createRequestLocaleMiddleware(i18n = new I18nService()) {
  return (
    request: LocaleRequestSource,
    _response: unknown,
    next: () => void,
  ): void => {
    const locale = i18n.resolveLocaleFromRequest(request);
    request.locale = locale;
    request.language = locale;
    next();
  };
}
