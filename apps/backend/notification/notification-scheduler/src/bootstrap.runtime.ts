import {
  bootstrapNestApi as bootstrapNestApiImplementation,
  resolveDefaultDevelopmentCorsOrigins as resolveDefaultDevelopmentCorsOriginsImplementation,
} from '@app/backend-common-bootstrap';

export const bootstrapNestApi = bootstrapNestApiImplementation;
export const resolveDefaultDevelopmentCorsOrigins = resolveDefaultDevelopmentCorsOriginsImplementation;
