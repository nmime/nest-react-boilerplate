import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

@Injectable()
export class EnumValidationPipe<T extends string> implements PipeTransform<T> {
  constructor(private readonly values: readonly T[]) {}

  transform(value: T): T {
    if (!this.values.includes(value)) {
      throw new BadRequestException("Invalid enum value.");
    }

    return value;
  }
}
