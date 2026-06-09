import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

@Injectable()
export class OneOfValidationPipe<T> implements PipeTransform<T> {
  constructor(private readonly allowedValues: readonly T[]) {}

  transform(value: T): T {
    if (!this.allowedValues.includes(value)) {
      throw new BadRequestException("Value is not allowed.");
    }

    return value;
  }
}
