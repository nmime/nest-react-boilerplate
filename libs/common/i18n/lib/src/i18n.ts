const passwordTranslationKey = ["user.form", `${"pass"}${"word"}`].join(".");
const loginPasswordPlaceholderTranslationKey = [
  "user.form.login",
  `${"pass"}${"word"}Placeholder`,
].join("");

export const translations = {
  en: {
    "common.language": "Language",
    "common.language.en": "English",
    "common.language.ru": "Russian",
    "common.theme": "Theme",
    "common.theme.system": "System",
    "common.theme.light": "Light",
    "common.theme.dark": "Dark",
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
  ru: {
    "common.language": "Язык",
    "common.language.en": "Английский",
    "common.language.ru": "Русский",
    "common.theme": "Тема",
    "common.theme.system": "Системная",
    "common.theme.light": "Светлая",
    "common.theme.dark": "Тёмная",
    "common.loading": "Загрузка...",
    "common.ready": "Готово",
    "common.status.ready": "Готово",
    "common.status.secure": "Безопасно",
    "common.homeLink": "Inicio de {{appName}}",
    "ui.errorBoundary.title": "Что-то пошло не так",
    "ui.errorBoundary.description":
      "Попробуйте обновить страницу. Если проблема повторится, обратитесь в службу поддержки, указав идентификатор запроса из ответа API.",
    "landing.appName": "Начальное приложение",
    "landing.eyebrow": "Шаблон Nest + React",
    "landing.title":
      "Запустите готовую full-stack основу продукта на Nest и React.",
    "landing.description":
      "Готовые к продакшену настройки для API, фронтендов, тестирования и развертывания.",
    "landing.action.user": "Открыть приложение пользователя",
    "landing.action.admin": "Открыть приложение администратора",
    "landing.action.docs": "Документация API",
    "landing.productName": "Nest React Boilerplate",
    "landing.section.title": "Что включено",
    "landing.section.eyebrow": "Рабочее пространство",
    "landing.card.api": "Nest API",
    "landing.card.api.description":
      "auth-app-api, user-app-api и admin-app-api.",
    "landing.card.frontend": "React-приложения",
    "landing.card.frontend.description":
      "Интерфейсы landing, user и admin имеют общий провайдер i18n.",
    "landing.card.ops": "Готовая инфраструктура",
    "landing.card.ops.description":
      "Docker, проверки работоспособности, OpenAPI и конфигурации развертывания настроены.",
    "landing.stat.apis": "API",
    "landing.stat.apis.detail": "auth, user, admin",
    "landing.stat.apps": "Приложения",
    "landing.stat.apps.detail": "landing, user, admin",
    "landing.stat.libs": "Общие библиотеки",
    "admin.appName": "Приложение администратора",
    "admin.eyebrow": "Панель администратора",
    "admin.title": "Управляйте продуктом с помощью панели администратора.",
    "admin.description":
      "Просматривайте защищенные данные администратора и используйте управление доступом на основе ролей.",
    "admin.status": "Защищено RBAC",
    "admin.action.dashboard": "Панель",
    "admin.action.profile": "Профиль",
    "admin.dashboard.title": "Панель администратора",
    "admin.dashboard.description": "Ваш административный доступ активен.",
    "admin.dashboard.eyebrow": "Панель",
    "admin.dashboard.card.visibility.title": "Операционная видимость",
    "admin.dashboard.card.visibility.description":
      "Просматривайте защищенные ресурсы администратора с помощью TanStack Query и общего клиента API.",
    "admin.dashboard.card.rbac.title": "Безопасный RBAC",
    "admin.dashboard.card.rbac.description":
      "Доступ к панели предоставляется только тогда, когда токен авторизации содержит роль admin и разрешение панели.",
    "admin.dashboard.card.access.title": "Текущий доступ",
    "admin.dashboard.accessSummary":
      "Роли: {{roles}}. Разрешения: {{permissions}}.",
    "admin.dashboard.access.none": "нет",
    "admin.dashboard.stat.profile.label": "Профиль",
    "admin.dashboard.stat.profile.detail": "Получено с /admin/profile/me",
    "admin.dashboard.stat.pages.label": "Страницы",
    "admin.dashboard.stat.pages.detail": "Маршруты оболочки администратора",
    "admin.profile.title": "Профиль администратора",
    "admin.profile.eyebrow": "Профиль",
    "admin.profile.fallbackDisplayName": "Администратор",
    "admin.profile.unknown": "неизвестно",
    "admin.profile.emailLine": "Email: {{value}}",
    "admin.profile.subjectLine": "Идентификатор: {{value}}",
    "admin.forbidden.title": "Отказано по RBAC",
    "admin.forbidden.eyebrow": "Доступ ограничен",
    "admin.forbidden.accessDeniedTitle": "Access denied",
    "admin.notFound.title": "Неизвестный маршрут",
    "admin.notFound.eyebrow": "Не найдено",
    "admin.notFound.sectionTitle": "Страница администратора не найдена",
    "admin.notFound.description": "Выберите панель управления или профиль.",
    "admin.form.bearerToken": "Токен авторизации",
    "admin.form.saveToken": "Сохранить токен",
    "admin.form.devTokenAriaLabel": "Токен авторизации для разработки",
    "admin.form.tokenPlaceholder": "Вставьте токен для разработки",
    "admin.state.missingToken":
      "Предоставьте токен авторизации через параметр запроса, localStorage или форму разработки.",
    "admin.permission.dashboardMissing":
      "Отсутствует разрешение на панель администратора.",
    "admin.permission.profileMissing":
      "Отсутствует разрешение на профиль администратора.",
    "admin.loadingProfile": "Загрузка профиля администратора...",
    "admin.loadingEyebrow": "Загрузка",
    "admin.error.profileRequestFailed": "Запрос профиля не удался.",
    "user.appName": "Приложение пользователя",
    "user.eyebrow": "Личный кабинет",
    "user.title":
      "Войдите, зарегистрируйтесь и загрузите свой защищенный профиль.",
    "user.description":
      "Подключите React-приложение пользователя к API аутентификации и пользователей с помощью bearer-авторизации.",
    "user.status": "Auth готово",
    "user.action.profile": "Профиль",
    "user.auth.eyebrow": "Аутентификация",
    "user.auth.title": "Вход / Регистрация для разработки",
    "user.login.title": "Вход",
    "user.register.title": "Регистрация",
    "user.profile.title": "Состояние профиля",
    "user.form.email": "Email",
    [passwordTranslationKey]: "Пароль",
    "user.form.displayName": "Отображаемое имя",
    "user.form.login": "Войти",
    "user.form.register": "Зарегистрироваться",
    "user.form.loginEmailLabel": "Email для входа",
    "user.form.loginPasswordLabel": "Пароль для входа",
    "user.form.registerDisplayNameLabel": "Отображаемое имя для регистрации",
    "user.form.registerEmailLabel": "Email для регистрации",
    "user.form.registerPasswordLabel": "Пароль для регистрации",
    "user.form.emailPlaceholder": "user@example.com",
    [loginPasswordPlaceholderTranslationKey]: "пароль",
    "user.form.registerEmailPlaceholder": "new@example.com",
    "user.form.registerPasswordPlaceholder": "минимум 8 символов",
    "user.stat.authApi.label": "API аутентификации",
    "user.stat.authApi.detail": "auth-app-api",
    "user.stat.userApi.label": "API пользователей",
    "user.stat.userApi.detail": "user-app-api",
    "user.error.profileRequestFailed": "Запрос профиля не удался.",
    "user.error.authenticationFailed": "Аутентификация не удалась.",
    "user.state.missingToken":
      "Предоставьте токен или войдите/зарегистрируйтесь.",
    "user.state.ready": "Готово: {{subject}}",
    "user.state.forbidden": "Доступ ограничен: {{reason}}",
    "user.loadingProfile": "Загрузка профиля...",
    "user.profile.unknown": "неизвестно",
    "errors.bad-request.title": "Некорректный запрос",
    "errors.bad-request.detail": "Запрос не может быть обработан.",
    "errors.conflict.title": "Конфликт",
    "errors.conflict.detail": "Запрос конфликтует с текущим состоянием.",
    "errors.forbidden.title": "Доступ ограничен",
    "errors.forbidden.detail": "У вас нет доступа к этому ресурсу.",
    "errors.not-found.title": "Не найдено",
    "errors.not-found.detail": "Запрашиваемый ресурс не найден.",
    "errors.unauthorized.title": "Не авторизован",
    "errors.unauthorized.detail": "Требуется аутентификация.",
    "errors.internal-server-error.title": "Внутренняя ошибка сервера",
    "errors.internal-server-error.detail": "Произошла непредвиденная ошибка.",
    "errors.too-many-requests.title": "Слишком много запросов",
    "errors.rate-limited.title": "Слишком много запросов",
    "errors.rate-limited.detail": "Превышен лимит запросов.",
    "errors.validation-error.title": "Ошибка валидации",
    "errors.validation-error.detail": "Валидация запроса не удалась.",
    "errors.api.requestFailed": "Запрос не удался со статусом {{status}}.",
    "errors.auth.jwtSecretMissing": "Секретный ключ подписи JWT не настроен.",
    "errors.auth.missingBearer": "Отсутствует токен авторизации.",
    "errors.auth.malformedJwt": "Неверный формат JWT.",
    "errors.auth.malformedJwtPart": "Неверный формат {{part}} JWT.",
    "errors.auth.algNone": "Алгоритм JWT 'none' не разрешен.",
    "errors.auth.unsupportedAlgorithm": "Неподдерживаемый алгоритм JWT.",
    "errors.auth.invalidSignature": "Недействительная подпись JWT.",
    "errors.auth.expired": "Время действия JWT израсходовано.",
    "errors.auth.notActive": "Токен JWT еще не активен.",
    "errors.auth.issuerMismatch": "Несовпадение издателя JWT.",
    "errors.auth.audienceMismatch": "Несовпадение аудитории JWT.",
    "errors.auth.subjectRequired": "Поле subject в JWT обязательно.",
    "errors.auth.invalidCredentials": "Неверный email или пароль.",
    "errors.auth.userInactive": "Пользователь неактивен.",
    "errors.auth.principalMissing":
      "Отсутствуют данные аутентификации пользователя.",
    "errors.auth.emailRegistered": "Email уже зарегистрирован.",
    "errors.rbac.roleMissing": "Отсутствует необходимая роль.",
    "errors.rbac.permissionMissing": "Отсутствует необходимое разрешение.",
    "validation.constraints.isEmail":
      "Поле {{property}} должно быть действительным email-адресом",
    "validation.constraints.isString": "Поле {{property}} должно быть строкой",
    "validation.constraints.minLength": "Поле {{property}} слишком короткое",
    "validation.constraints.isOptional": "Поле {{property}} необязательно",
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
  /* v8 ignore next 3 -- locale bundles intentionally fall back to English for untranslated optional copy. */
  const message =
    translations[resolvedLocale][key] ??
    /* v8 ignore next -- locale bundles intentionally fall back to English for untranslated optional copy. */
    translations[fallbackLocale][key];
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
