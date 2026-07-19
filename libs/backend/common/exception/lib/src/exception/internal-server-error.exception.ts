import { HttpStatus } from '@nestjs/common';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export class InternalServerErrorException extends Exception({
  name: 'InternalServerErrorException',
  kind: ExceptionKind.Server,
  status: HttpStatus.INTERNAL_SERVER_ERROR,
}) {
  constructor(meta?: Record<string, unknown>, cause?: Error) {
    super({ meta, cause });
  }
}
