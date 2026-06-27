import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket?: string;
}

interface S3Environment {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
}

const schema = Joi.object<S3Environment>({
  S3_ENDPOINT: Joi.string().empty("").optional(),
  S3_REGION: Joi.string().empty("").optional(),
  S3_BUCKET: Joi.string().empty("").optional(),
});

@Injectable()
export class S3ConfigService {
  protected readonly configService = createConfig<S3Environment>(schema);

  constructor(private readonly config: S3Config = {}) {}

  get endpoint(): string | undefined {
    return this.config.endpoint ?? this.configService.get("S3_ENDPOINT");
  }

  get region(): string | undefined {
    return this.config.region ?? this.configService.get("S3_REGION");
  }

  get bucket(): string | undefined {
    return this.config.bucket ?? this.configService.get("S3_BUCKET");
  }
}
