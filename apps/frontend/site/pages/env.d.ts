/// <reference types="vite/client" />

/**
 * The build-time keys `+Head.tsx` reads one at a time. `vite/client` types the rest of the
 * environment through an `any` index signature, which would make each read an untyped one.
 */
interface ImportMetaEnv {
  readonly VITE_PRODUCT_ICON_HREF?: string;
  readonly VITE_PRODUCT_ICON_TYPE?: string;
  readonly VITE_PRODUCT_NAME?: string;
  readonly VITE_PRODUCT_THEME_COLOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
