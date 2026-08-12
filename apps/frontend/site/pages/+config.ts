import vikeReact from 'vike-react/config';
import type { Config } from 'vike/types';
import { type FrontendEnv, resolveProductBrand } from '@app/frontend-api-support';

// The server renders the document, so there is no runtime-config.js pass to correct a stale
// title later: the identity has to come from the shared brand at build time.
// `vite/client` is not in the lint program's tsconfig, so `import.meta.env` has no type there; the
// cast is how every other app in the workspace hands it to the shared env readers.
const brand = resolveProductBrand(import.meta.env as FrontendEnv, {});

export default {
  clientRouting: true,
  extends: [vikeReact],
  favicon: brand.iconHref,
  passToClient: ['routeParams'],
  ssr: true,
  title: brand.name,
} satisfies Config;
