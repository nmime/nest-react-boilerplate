import { HttpStatus } from "@nestjs/common";
import { AppHttpException } from "@app/common/exception";

export class ClientDataValidationException extends AppHttpException {
  constructor(errors: unknown) {
    super({
      type: "urn:problem:nest-react-boilerplate:client-data-validation",
      title: "Client data validation failed",
      status: HttpStatus.BAD_REQUEST,
      detail: "Request client data validation failed.",
      code: "client-data-validation",
      extensions: { errors },
    });
  }
}
