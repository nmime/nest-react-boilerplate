import { Exception, ExceptionKind } from '@app/backend-common-exception';

export class StepUpRequiredException extends Exception({
  name: 'StepUpRequiredException',
  kind: ExceptionKind.Client,
  problemType: 'step-up-required',
}) {}

export class LastAuthMethodUnlinkForbiddenException extends Exception({
  name: 'LastAuthMethodUnlinkForbiddenException',
  kind: ExceptionKind.Client,
  problemType: 'last-auth-method-unlink-forbidden',
}) {}
