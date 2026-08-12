// @requirements REQ-FRONTEND-SHELL-004
import { describe, expect, it } from 'vitest';
import { designColors } from '@app/common-design-tokens';
import { applyProductBrand, applyProductBrandToHtml, defaultProductBrand, resolveProductBrand } from './product-brand';

describe('product brand configuration', () => {
  it('falls back to the boilerplate identity when nothing is configured', () => {
    expect(resolveProductBrand({}, {})).toEqual(defaultProductBrand);
  });

  it('reads the product identity from build-time env', () => {
    const brand = resolveProductBrand(
      {
        VITE_PRODUCT_ICON_HREF: '/logo.webp',
        VITE_PRODUCT_ICON_TYPE: 'image/webp',
        VITE_PRODUCT_NAME: 'Acme Cloud',
        VITE_PRODUCT_THEME_COLOR: '#0b7138',
      },
      {},
    );

    expect(brand).toEqual({
      chromeBackgroundColor: defaultProductBrand.chromeBackgroundColor,
      chromeBottomBarColor: defaultProductBrand.chromeBottomBarColor,
      chromeHeaderColor: defaultProductBrand.chromeHeaderColor,
      iconHref: '/logo.webp',
      iconType: 'image/webp',
      name: 'Acme Cloud',
      themeColor: '#0b7138',
    });
  });

  it('lets per-deployment runtime config win over the build, so one image serves many brands', () => {
    const brand = resolveProductBrand({ VITE_PRODUCT_NAME: 'Build Name' }, { productName: 'Deployment Name' });

    expect(brand.name).toBe('Deployment Name');
  });

  it('ignores blank overrides instead of blanking the brand', () => {
    expect(resolveProductBrand({ VITE_PRODUCT_NAME: '  ' }, {}).name).toBe(defaultProductBrand.name);
  });

  // The mini-app chrome is painted by the host (Telegram), not by CSS, so the design tokens never
  // reach it. Without these fields a configured rebrand stops at the browser tab and the embedded
  // header/background/bottom bar stay boilerplate blue.
  it('reads the embedded-chrome colours a host paints outside the document', () => {
    const brand = resolveProductBrand(
      {
        VITE_PRODUCT_CHROME_BACKGROUND_COLOR: '#101010',
        VITE_PRODUCT_CHROME_BOTTOM_BAR_COLOR: '#202020',
        VITE_PRODUCT_CHROME_HEADER_COLOR: '#303030',
      },
      {},
    );

    expect(brand.chromeBackgroundColor).toBe('#101010');
    expect(brand.chromeBottomBarColor).toBe('#202020');
    expect(brand.chromeHeaderColor).toBe('#303030');
  });

  it('lets a deployment repaint the chrome without a rebuild', () => {
    const brand = resolveProductBrand(
      { VITE_PRODUCT_CHROME_HEADER_COLOR: '#303030' },
      { productChromeHeaderColor: '#404040' },
    );

    expect(brand.chromeHeaderColor).toBe('#404040');
  });

  it('defaults the chrome to the design tokens the app used to hardcode', () => {
    const brand = resolveProductBrand({}, {});

    expect(brand.chromeBackgroundColor).toBe(designColors.light.background);
    expect(brand.chromeBottomBarColor).toBe(designColors.light.foreground);
    expect(brand.chromeHeaderColor).toBe(designColors.light.ring);
  });

  it('applies the brand to the document title, theme colour and icon', () => {
    const documentStub = document.implementation.createHTMLDocument('placeholder');

    applyProductBrand(documentStub, {
      ...defaultProductBrand,
      iconHref: '/logo.webp',
      iconType: 'image/webp',
      name: 'Acme Cloud',
      themeColor: '#0b7138',
    });

    expect(documentStub.title).toBe('Acme Cloud');
    expect(documentStub.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0b7138');
    const icon = documentStub.querySelector('link[rel="icon"]');
    expect(icon?.getAttribute('href')).toBe('/logo.webp');
    expect(icon?.getAttribute('type')).toBe('image/webp');
  });

  it('updates the tags an index.html already ships instead of duplicating them', () => {
    const documentStub = document.implementation.createHTMLDocument('placeholder');
    documentStub.head.innerHTML =
      '<meta name="theme-color" content="#2563eb" /><link rel="icon" type="image/x-icon" href="/favicon.ico" />';

    applyProductBrand(documentStub, defaultProductBrand);

    expect(documentStub.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(documentStub.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
  });
});

describe('product brand in the served document', () => {
  const brand = {
    ...defaultProductBrand,
    iconHref: '/logo.webp',
    iconType: 'image/webp',
    name: 'Acme Cloud',
    themeColor: '#0b7138',
  };

  // The runtime pass only lands after the bundle executes. Everything that reads the document
  // before that — the browser tab during load, a link preview, a crawler — sees the shipped
  // markup, so the build has to brand the HTML too.
  it('rewrites the shipped title, theme colour and icon', () => {
    const html = applyProductBrandToHtml(
      [
        '<!doctype html>',
        '<html><head>',
        '<title>Nest React Boilerplate</title>',
        '<meta name="theme-color" content="#2563eb" />',
        '<link rel="icon" type="image/x-icon" href="/favicon.ico" />',
        '</head><body></body></html>',
      ].join('\n'),
      brand,
    );

    expect(html).toContain('<title>Acme Cloud</title>');
    expect(html).toContain('content="#0b7138"');
    expect(html).toContain('href="/logo.webp"');
    expect(html).toContain('type="image/webp"');
    expect(html).not.toContain('favicon.ico');
  });

  it('escapes a brand name so a product cannot inject markup through configuration', () => {
    const html = applyProductBrandToHtml('<title>x</title>', { ...brand, name: '</title><script>alert(1)</script>' });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;');
  });

  it('leaves an attribute the markup never declared alone rather than inventing one', () => {
    // Rewriting only what is there keeps this pass from adding an attribute the author omitted on
    // purpose; `applyProductBrand` fills the gap once the bundle runs.
    const html = applyProductBrandToHtml('<link rel="icon" href="/favicon.ico" />', brand);

    expect(html).toContain('href="/logo.webp"');
    expect(html).not.toContain('type=');
  });

  it('leaves markup that declares no brand tags for the runtime pass to fill in', () => {
    const html = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';

    expect(applyProductBrandToHtml(html, brand)).toBe(html);
  });
});
