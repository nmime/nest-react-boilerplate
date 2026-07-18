import { Injectable, Optional } from '@nestjs/common';
import { createConfig } from '@app/common-config';
import Joi from 'joi';

export interface S3Config {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  forcePathStyle?: boolean;
}

interface S3Environment {
  S3_ENDPOINT?: string;
  S3_REGION: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_FORCE_PATH_STYLE: boolean;
}

const schema = Joi.object<S3Environment>({
  S3_ENDPOINT: Joi.string().uri().empty('').optional(),
  S3_REGION: Joi.string().empty('').default('us-east-1'),
  S3_BUCKET: Joi.string().empty('').optional(),
  S3_ACCESS_KEY: Joi.string().empty('').optional(),
  S3_SECRET_KEY: Joi.string().empty('').optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(false),
});

@Injectable()
export class S3ConfigService {
  protected readonly configService = createConfig<S3Environment>(schema);

  constructor(@Optional() private readonly config: S3Config = {}) {}

  get endpoint(): string | undefined {
    return this.config.endpoint ?? this.configService.get('S3_ENDPOINT');
  }

  get region(): string {
    return this.config.region ?? this.configService.get('S3_REGION');
  }

  get bucket(): string | undefined {
    return this.config.bucket ?? this.configService.get('S3_BUCKET');
  }

  get accessKey(): string | undefined {
    return this.config.accessKey ?? this.configService.get('S3_ACCESS_KEY');
  }

  get secretKey(): string | undefined {
    return this.config.secretKey ?? this.configService.get('S3_SECRET_KEY');
  }

  get forcePathStyle(): boolean {
    return this.config.forcePathStyle ?? this.configService.get('S3_FORCE_PATH_STYLE');
  }
}
