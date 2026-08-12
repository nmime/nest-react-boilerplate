import { resolveProductBrand, type ProductBrand } from '@app/frontend-api-support';
import { getFrontendEnv } from './frontend-env';

/**
 * Binds the shared brand resolution to this app's build-time env. The resolution
 * itself is shared so admin and landing brand from the same configuration.
 */
export const resolveAppProductBrand = (): ProductBrand => resolveProductBrand(getFrontendEnv());
