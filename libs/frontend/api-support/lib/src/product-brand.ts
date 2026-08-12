import { getFrontendRuntimeConfig, type FrontendEnv, type FrontendRuntimeConfig } from './frontend-env';

export interface ProductBrand {
  /**
   * Surfaces an embedding host paints for us — the Telegram mini-app header, background and bottom
   * bar. They sit outside the document, so neither the stylesheet nor `applyProductBrand` reaches
   * them and a rebrand that only covers the tab leaves them on the boilerplate palette.
   */
  chromeBackgroundColor: string;
  chromeBottomBarColor: string;
  chromeHeaderColor: string;
  iconHref: string;
  iconType: string;
  name: string;
  themeColor: string;
}

/**
 * Identity a product overrides instead of editing sources. The boilerplate's own
 * values are the defaults, so an untouched checkout looks exactly as it does now.
 *
 * The colours are literals rather than `designColors` reads because the Vite config imports this
 * module directly to brand `index.html` at build time, where workspace aliases do not resolve. The
 * spec pins each one to the token it mirrors, so drift fails a test instead of shipping.
 */
export const defaultProductBrand: ProductBrand = {
  chromeBackgroundColor: '#f8fafc',
  chromeBottomBarColor: '#0f172a',
  chromeHeaderColor: '#2563eb',
  iconHref: '/favicon.ico',
  iconType: 'image/x-icon',
  name: 'Nest React Boilerplate',
  themeColor: '#2563eb',
};

const text = (...candidates: readonly (boolean | string | undefined)[]): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
};

/**
 * Per-deployment runtime config wins over the build-time env so one immutable
 * image can serve several brands, mirroring how feature flags resolve.
 */
export const resolveProductBrand = (
  env: FrontendEnv,
  runtimeConfig: FrontendRuntimeConfig = getFrontendRuntimeConfig(),
): ProductBrand => ({
  chromeBackgroundColor:
    text(runtimeConfig['productChromeBackgroundColor'], env['VITE_PRODUCT_CHROME_BACKGROUND_COLOR']) ??
    defaultProductBrand.chromeBackgroundColor,
  chromeBottomBarColor:
    text(runtimeConfig['productChromeBottomBarColor'], env['VITE_PRODUCT_CHROME_BOTTOM_BAR_COLOR']) ??
    defaultProductBrand.chromeBottomBarColor,
  chromeHeaderColor:
    text(runtimeConfig['productChromeHeaderColor'], env['VITE_PRODUCT_CHROME_HEADER_COLOR']) ??
    defaultProductBrand.chromeHeaderColor,
  iconHref: text(runtimeConfig['productIconHref'], env['VITE_PRODUCT_ICON_HREF']) ?? defaultProductBrand.iconHref,
  iconType: text(runtimeConfig['productIconType'], env['VITE_PRODUCT_ICON_TYPE']) ?? defaultProductBrand.iconType,
  name: text(runtimeConfig['productName'], env['VITE_PRODUCT_NAME']) ?? defaultProductBrand.name,
  themeColor:
    text(runtimeConfig['productThemeColor'], env['VITE_PRODUCT_THEME_COLOR']) ?? defaultProductBrand.themeColor,
});

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const replaceAttribute = (tag: string, attribute: string, value: string): string =>
  new RegExp(`(\\s${attribute}=")[^"]*(")`, 'iu').test(tag)
    ? tag.replace(new RegExp(`(\\s${attribute}=")[^"]*(")`, 'iu'), `$1${escapeHtml(value)}$2`)
    : tag;

/**
 * Brands the markup itself at build time. `applyProductBrand` only runs once the bundle has
 * executed, so the browser tab during load, a link preview and a crawler all see whatever the
 * shipped `index.html` said. Tags the markup does not declare are left to the runtime pass.
 */
export const applyProductBrandToHtml = (html: string, brand: ProductBrand): string =>
  html
    .replace(/<title>[\s\S]*?<\/title>/iu, `<title>${escapeHtml(brand.name)}</title>`)
    .replace(/<meta\s[^>]*name="theme-color"[^>]*>/iu, (tag) => replaceAttribute(tag, 'content', brand.themeColor))
    .replace(/<link\s[^>]*rel="icon"[^>]*>/iu, (tag) =>
      replaceAttribute(replaceAttribute(tag, 'href', brand.iconHref), 'type', brand.iconType),
    );

const upsertHeadElement = <TagName extends keyof HTMLElementTagNameMap>(
  target: Document,
  tagName: TagName,
  selector: string,
): HTMLElementTagNameMap[TagName] => {
  const existing = target.querySelector<HTMLElementTagNameMap[TagName]>(selector);
  if (existing) {
    return existing;
  }
  const created = target.createElement(tagName);
  target.head.append(created);
  return created;
};

/**
 * Applies the resolved brand to the document `index.html` shipped as a default,
 * so title, theme colour and icon follow the configuration rather than markup.
 */
export const applyProductBrand = (target: Document, brand: ProductBrand): void => {
  target.title = brand.name;

  const themeColor = upsertHeadElement(target, 'meta', 'meta[name="theme-color"]');
  themeColor.setAttribute('name', 'theme-color');
  themeColor.setAttribute('content', brand.themeColor);

  const icon = upsertHeadElement(target, 'link', 'link[rel="icon"]');
  icon.setAttribute('rel', 'icon');
  icon.setAttribute('type', brand.iconType);
  icon.setAttribute('href', brand.iconHref);
};
