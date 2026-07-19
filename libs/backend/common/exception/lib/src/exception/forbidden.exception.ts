import { HttpStatus } from '@nestjs/common';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export class ForbiddenException extends Exception({
  name: 'ForbiddenException',
  kind: ExceptionKind.Client,
  status: HttpStatus.FORBIDDEN,
}) {
  constructor(permission?: string, role?: string) {
    super({ meta: { permission, role } });
  }
}
