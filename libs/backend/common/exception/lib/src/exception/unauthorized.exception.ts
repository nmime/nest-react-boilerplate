import { HttpStatus } from '@nestjs/common';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export class UnauthorizedException extends Exception({
  name: 'UnauthorizedException',
  kind: ExceptionKind.Client,
  status: HttpStatus.UNAUTHORIZED,
}) {}
