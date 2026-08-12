import vikeReact from 'vike-react/config';
import type { Config } from 'vike/types';
import { resolveProductBrand } from '@app/frontend-api-support';

// The server renders the document, so there is no runtime-config.js pass to correct a stale
// title later: the identity has to come from the shared brand at build time.
const brand = resolveProductBrand(import.meta.env, {});

export default {
  clientRouting: true,
  extends: [vikeReact],
  favicon: brand.iconHref,
  passToClient: ['routeParams'],
  ssr: true,
  title: brand.name,
} satisfies Config;
