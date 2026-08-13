import { resolveProductBrand } from '@app/frontend-api-support';

/**
 * The identity lives here rather than in the `title` and `favicon` settings of `+config.ts`
 * because Vike resolves that file by executing it in Node, outside Vite, and rewrites every
 * non-script import its graph reaches into a placeholder string. The shared brand sits behind the
 * api-support barrel, and that barrel reaches the i18n catalogs, which are JSON. A `+` file is a
 * pointer import instead: Vike records it and the server loads it through Vite, where the whole
 * workspace resolves normally.
 */
export function Head() {
  // Vike replaces a bare `import.meta.env` with `null`, and Vite only folds a value into the
  // bundle where the key is spelled out, so the four keys the document needs are read one at a
  // time. That keeps the site's identity baked in at build time, like the markup the other
  // frontends ship.
  const brand = resolveProductBrand({
    VITE_PRODUCT_ICON_HREF: import.meta.env.VITE_PRODUCT_ICON_HREF,
    VITE_PRODUCT_ICON_TYPE: import.meta.env.VITE_PRODUCT_ICON_TYPE,
    VITE_PRODUCT_NAME: import.meta.env.VITE_PRODUCT_NAME,
    VITE_PRODUCT_THEME_COLOR: import.meta.env.VITE_PRODUCT_THEME_COLOR,
  });

  return (
    <>
      <title>{brand.name}</title>
      <link rel="icon" type={brand.iconType} href={brand.iconHref} />
      <meta name="theme-color" content={brand.themeColor} />
    </>
  );
}
