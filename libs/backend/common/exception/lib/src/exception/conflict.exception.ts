import { HttpStatus } from '@nestjs/common';
import { Exception, ExceptionKind } from '../abstract/base.exception';

export const ConflictInfoType = class {
  resourceType!: string;
  field?: string;
};

export class ConflictException extends Exception({
  name: 'ConflictException',
  kind: ExceptionKind.Client,
  problemType: 'conflict',
  title: 'Conflict',
  detail: 'The request conflicts with the current state of the resource',
  status: HttpStatus.CONFLICT,
  dataType: ConflictInfoType,
}) {
  constructor(resourceType: string, field?: string) {
    super({ data: { resourceType, field } });
  }
}

export class BadRequestException extends Exception({
  name: 'BadRequestException',
  kind: ExceptionKind.Client,
  problemType: 'bad_request',
  title: 'Bad Request',
  detail: 'The request could not be processed due to client error',
  status: HttpStatus.BAD_REQUEST,
}) {}
