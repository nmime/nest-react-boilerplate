import { Exception } from '@app/backend-common-exception';
import { ExceptionKind } from '@app/backend-common-exception';
import type { ValidationErrorInfo } from './validation-error-info.type';

export const ClientDataValidationExtensionsType = class {
  errors!: ValidationErrorInfo[];
};

export class ClientDataValidationException extends Exception({
  name: 'ClientDataValidationException',
  kind: ExceptionKind.Client,
  problemType: 'client-data-validation',
  extensionsType: ClientDataValidationExtensionsType,
}) {
  constructor(errors: ValidationErrorInfo[]) {
    super({ extensions: { errors } });
  }
}
