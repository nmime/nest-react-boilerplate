import { HttpStatus } from '@nestjs/common';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export const ResourceNotFoundInfoType = class {
  resourceType!: string;
  resourceId?: string;
};

export class ResourceNotFoundException extends Exception({
  name: 'ResourceNotFoundException',
  kind: ExceptionKind.Client,
  problemType: 'resource_not_found',
  title: 'Resource Not Found',
  detail: 'The requested resource was not found',
  status: HttpStatus.NOT_FOUND,
  dataType: ResourceNotFoundInfoType,
}) {
  constructor(resourceType: string, resourceId?: string) {
    super({ data: { resourceType, resourceId } });
  }
}
