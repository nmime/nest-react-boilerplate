import vikeReact from 'vike-react/config';
import type { Config } from 'vike/types';

export default {
  clientRouting: true,
  extends: [vikeReact],
  passToClient: ['routeParams'],
  ssr: true,
} satisfies Config;
