import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export const ResourceNotFoundExtensionsType = class {
  resourceType!: string;
};

export class ResourceNotFoundException extends Exception({
  name: 'ResourceNotFoundException',
  kind: ExceptionKind.Client,
  problemType: 'resource-not-found',
  extensionsType: ResourceNotFoundExtensionsType,
}) {
  constructor(resourceType: string, resourceId?: string) {
    super({ extensions: { resourceType }, meta: { resourceId } });
  }
}
