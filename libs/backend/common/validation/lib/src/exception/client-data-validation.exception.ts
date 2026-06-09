import { BadRequestException } from "@nestjs/common";

export class ClientDataValidationException extends BadRequestException {
  constructor(errors: unknown) {
    super({ code: "client-data-validation", errors });
  }
}
