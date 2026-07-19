import { HttpStatus } from '@nestjs/common';
import { Exception, ExceptionKind } from '../abstract/base.exception';

export class InternalException extends Exception({
  name: 'InternalException',
  kind: ExceptionKind.Server,
  status: HttpStatus.INTERNAL_SERVER_ERROR,
}) {
  constructor(meta?: Record<string, unknown>, cause?: Error) {
    super({ meta, cause });
  }
}
