import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";

interface CommonFormatEnvironment {
  DEFAULT_LOCALE: string;
}

const schema = Joi.object<CommonFormatEnvironment>({
  DEFAULT_LOCALE: Joi.string().empty("").default("en-US"),
});

@Injectable()
export class CommonFormatConfigService {
  protected readonly configService =
    createConfig<CommonFormatEnvironment>(schema);

  constructor(private readonly locale?: string) {}

  get defaultLocale(): string {
    return this.locale ?? this.configService.get("DEFAULT_LOCALE");
  }
}
