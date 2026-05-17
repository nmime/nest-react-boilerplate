export const translations = {
  en: {
    "common.language": "Language",
    "common.language.en": "English",
    "common.language.es": "Spanish",
    "common.loading": "Loading...",
    "common.ready": "Ready",
    "common.status.ready": "Ready",
    "common.status.secure": "Secure",
    "landing.appName": "Landing App",
    "landing.eyebrow": "Nest + React boilerplate",
    "landing.title": "Launch a full-stack Nest and React product foundation.",
    "landing.description":
      "Production-ready defaults for APIs, frontends, testing, and deployment.",
    "landing.action.user": "Open user app",
    "landing.action.admin": "Open admin app",
    "landing.section.title": "What is included",
    "landing.card.api": "Nest APIs",
    "landing.card.frontend": "React apps",
    "landing.card.ops": "Deployment-ready ops",
    "landing.stat.apps": "Apps",
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
    "admin.profile.title": "Admin profile",
    "admin.forbidden.title": "RBAC denied",
    "admin.notFound.title": "Unknown route",
    "admin.notFound.description": "Choose dashboard or profile.",
    "admin.form.bearerToken": "Bearer token",
    "admin.form.saveToken": "Save token",
    "admin.state.missingToken":
      "Provide a bearer token via query parameter, localStorage, or the development form.",
    "admin.permission.dashboardMissing": "Missing admin dashboard permission.",
    "admin.permission.profileMissing": "Missing admin profile permission.",
    "admin.loadingProfile": "Loading admin profile...",
    "user.appName": "User App",
    "user.eyebrow": "User workspace",
    "user.title": "Sign in, register, and load your protected profile.",
    "user.description":
      "Connect the React user app to the auth and user APIs using bearer authentication.",
    "user.status": "Auth ready",
    "user.action.profile": "Profile",
    "user.login.title": "Login",
    "user.register.title": "Register",
    "user.profile.title": "Profile state",
    "user.form.email": "Email",
    "user.form.password": "Password",
    "user.form.displayName": "Display name",
    "user.form.login": "Login",
    "user.form.register": "Register",
    "user.state.missingToken": "Provide a token or use login/register.",
    "user.state.ready": "Ready: {{subject}}",
    "user.state.forbidden": "Forbidden: {{reason}}",
    "user.loadingProfile": "Loading profile...",
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
    "landing.appName": "App de inicio",
    "landing.eyebrow": "Boilerplate Nest + React",
    "landing.title": "Lanza una base full-stack con Nest y React.",
    "landing.description":
      "Valores listos para producción para APIs, frontends, pruebas y despliegue.",
    "landing.action.user": "Abrir app de usuario",
    "landing.action.admin": "Abrir app de admin",
    "landing.section.title": "Qué incluye",
    "landing.card.api": "APIs Nest",
    "landing.card.frontend": "Apps React",
    "landing.card.ops": "Operaciones listas para desplegar",
    "landing.stat.apps": "Apps",
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
    "admin.profile.title": "Perfil de admin",
    "admin.forbidden.title": "RBAC denegado",
    "admin.notFound.title": "Ruta desconocida",
    "admin.notFound.description": "Elige panel o perfil.",
    "admin.form.bearerToken": "Token bearer",
    "admin.form.saveToken": "Guardar token",
    "admin.state.missingToken":
      "Proporciona un token bearer por parámetro de consulta, localStorage o el formulario de desarrollo.",
    "admin.permission.dashboardMissing": "Falta el permiso del panel de admin.",
    "admin.permission.profileMissing": "Falta el permiso del perfil de admin.",
    "admin.loadingProfile": "Cargando perfil de admin...",
    "user.appName": "App de usuario",
    "user.eyebrow": "Espacio de usuario",
    "user.title": "Inicia sesión, regístrate y carga tu perfil protegido.",
    "user.description":
      "Conecta la app React de usuario a las APIs de auth y usuario con autenticación bearer.",
    "user.status": "Auth listo",
    "user.action.profile": "Perfil",
    "user.login.title": "Iniciar sesión",
    "user.register.title": "Registro",
    "user.profile.title": "Estado del perfil",
    "user.form.email": "Email",
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- Translation text, not a credential.
    "user.form.password": "Contraseña",
    "user.form.displayName": "Nombre visible",
    "user.form.login": "Entrar",
    "user.form.register": "Registrarse",
    "user.state.missingToken": "Proporciona un token o usa login/registro.",
    "user.state.ready": "Listo: {{subject}}",
    "user.state.forbidden": "Prohibido: {{reason}}",
    "user.loadingProfile": "Cargando perfil...",
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
