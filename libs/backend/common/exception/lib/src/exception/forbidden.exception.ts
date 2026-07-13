import { HttpStatus } from '@nestjs/common';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';

export const ForbiddenInfoType = class {
  permission?: string;
  role?: string;
};

export class ForbiddenException extends Exception({
  name: 'ForbiddenException',
  kind: ExceptionKind.Client,
  problemType: 'forbidden',
  title: 'Forbidden',
  detail: 'You do not have permission to perform this action',
  status: HttpStatus.FORBIDDEN,
  dataType: ForbiddenInfoType,
}) {
  constructor(permission?: string, role?: string) {
    super({ data: { permission, role } });
  }
}
