import { Injectable } from "@nestjs/common";

@Injectable()
export class CommonFormatConfigService {
  constructor(
    private readonly locale = process.env.DEFAULT_LOCALE ?? "en-US",
  ) {}

  get defaultLocale(): string {
    return this.locale;
  }
}
