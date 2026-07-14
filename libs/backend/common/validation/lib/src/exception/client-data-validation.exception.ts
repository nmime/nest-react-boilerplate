import { HttpStatus } from '@nestjs/common';
import { Exception } from '@app/backend-common-exception';
import { ExceptionKind } from '@app/backend-common-exception';
import type { ValidationErrorInfo } from './validation-error-info.type';

export const ClientDataValidationInfoType = class {
  errors!: ValidationErrorInfo[];
};

export class ClientDataValidationException extends Exception({
  name: 'ClientDataValidationException',
  kind: ExceptionKind.Client,
  problemType: 'client_data_validation',
  title: 'Client Data Validation Failed',
  detail: 'The provided data failed validation',
  status: HttpStatus.BAD_REQUEST,
  dataType: ClientDataValidationInfoType,
}) {
  constructor(errors: ValidationErrorInfo[]) {
    super({ data: { errors } });
  }
}
