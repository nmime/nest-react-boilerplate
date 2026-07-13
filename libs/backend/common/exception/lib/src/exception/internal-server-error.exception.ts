import { HttpStatus } from '@nestjs/common';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export class InternalServerErrorException extends Exception({
  name: 'InternalServerErrorException',
  kind: ExceptionKind.Server,
  problemType: 'internal_server_error',
  title: 'Internal Server Error',
  detail: 'An unexpected error occurred',
  status: HttpStatus.INTERNAL_SERVER_ERROR,
}) {
  constructor(meta?: Record<string, unknown>, cause?: Error) {
    super({ meta, cause });
  }
}
