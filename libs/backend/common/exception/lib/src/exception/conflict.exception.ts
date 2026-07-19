import { HttpStatus } from '@nestjs/common';
import { Exception, ExceptionKind } from '../abstract/base.exception';

export const ConflictExtensionsType = class {
  resourceType!: string;
  field?: string;
};

export class ConflictException extends Exception({
  name: 'ConflictException',
  kind: ExceptionKind.Client,
  problemType: 'resource-conflict',
  extensionsType: ConflictExtensionsType,
}) {
  constructor(resourceType: string, field?: string) {
    super({ extensions: { resourceType, field } });
  }
}

export class BadRequestException extends Exception({
  name: 'BadRequestException',
  kind: ExceptionKind.Client,
  status: HttpStatus.BAD_REQUEST,
}) {}
