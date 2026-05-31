import { Injectable } from "@nestjs/common";

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket?: string;
}

@Injectable()
export class S3ConfigService {
  constructor(private readonly config: S3Config = {}) {}

  get endpoint(): string | undefined {
    return this.config.endpoint ?? process.env.S3_ENDPOINT;
  }

  get region(): string | undefined {
    return this.config.region ?? process.env.S3_REGION;
  }

  get bucket(): string | undefined {
    return this.config.bucket ?? process.env.S3_BUCKET;
  }
}
