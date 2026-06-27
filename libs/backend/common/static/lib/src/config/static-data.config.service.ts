import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";

interface StaticDataEnvironment {
  STATIC_DATA_ROOT: string;
}

const schema = Joi.object<StaticDataEnvironment>({
  STATIC_DATA_ROOT: Joi.string().empty("").default("."),
});

@Injectable()
export class StaticDataConfigService {
  protected readonly configService =
    createConfig<StaticDataEnvironment>(schema);

  constructor(private readonly rootDir?: string) {}

  get dataRoot(): string {
    return this.rootDir ?? this.configService.get("STATIC_DATA_ROOT");
  }
}
