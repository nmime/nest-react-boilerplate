import { build } from 'vike/api';

import config from '../site.vite.config.mts';

await build({ viteConfig: { ...config, configFile: false } });
